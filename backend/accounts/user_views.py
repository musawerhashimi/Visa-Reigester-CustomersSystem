"""Account administration (sections 42 and 64).

Staff accounts are created here rather than through public signup, which
always produces a customer. Roles carry a default permission set; an
administrator may widen or narrow one person's access without inventing a
new role.
"""

import secrets

from django.contrib.auth import get_user_model
from django.db.models import Count, Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from audit import services as audit
from branches.scoping import sees_all_branches
from core.permissions import IsMISUser

from . import permissions as perms
from .models import LoginHistory
from .permissions import ALL_PERMISSIONS, permissions_for_role
from .user_serializers import (
    AccountSerializer,
    CreateAccountSerializer,
    SetPasswordSerializer,
    UpdateAccountSerializer,
)

User = get_user_model()


class AccountViewSet(viewsets.ModelViewSet):
    """Manage the people who use the system."""

    permission_classes = (IsMISUser,)
    filterset_fields = ("role", "is_active")
    search_fields = ("first_name", "last_name", "email", "phone")
    ordering_fields = ("created_at", "email", "role")

    def get_serializer_class(self):
        if self.action == "create":
            return CreateAccountSerializer
        if self.action in ("update", "partial_update"):
            return UpdateAccountSerializer
        return AccountSerializer

    def get_queryset(self):
        if not self.request.user.has_perm_slug(perms.USERS_VIEW):
            return User.objects.none()
        return User.objects.annotate(
            assigned_count=Count(
                "assigned_applications",
                filter=Q(assigned_applications__deleted_at__isnull=True),
                distinct=True,
            )
        ).order_by("role", "first_name", "last_name", "email")

    def _require(self, slug, message):
        if not self.request.user.has_perm_slug(slug):
            raise PermissionDenied(message)

    def _guard_branch(self, branch):
        """A branch user may only place staff in their own office.

        Accounts are not branch-scoped for reading, but creating a colleague
        inside another branch would hand that branch's work to someone the
        general office never posted there.
        """
        if branch is None or sees_all_branches(self.request.user):
            return
        if branch.pk != self.request.user.branch_id:
            raise PermissionDenied("You can only manage staff in your own branch.")

    def _guard_privilege(self, role):
        """Only a super admin may create or promote another super admin.

        Without this an admin could grant themselves unrestricted access by
        editing a colleague's role and signing in as them.
        """
        if (
            role == User.Role.SUPER_ADMIN
            and self.request.user.role != User.Role.SUPER_ADMIN
        ):
            raise PermissionDenied("Only a super admin can grant that role.")

    def perform_create(self, serializer):
        self._require(perms.USERS_CREATE, "You cannot create accounts.")
        self._guard_privilege(serializer.validated_data.get("role"))
        self._guard_branch(serializer.validated_data.get("branch"))

        user = serializer.save()
        audit.record(
            action="create",
            module="accounts",
            actor=self.request.user,
            record_id=user.pk,
            record_label=user.email,
            new_value=user.role,
            description="Account created.",
            request=self.request,
        )

    def perform_update(self, serializer):
        self._require(perms.USERS_EDIT, "You cannot change accounts.")

        instance = serializer.instance
        self._guard_branch(serializer.validated_data.get("branch"))
        new_role = serializer.validated_data.get("role", instance.role)
        if new_role != instance.role:
            self._guard_privilege(new_role)
            # A super admin must not be demoted by someone who is not one.
            if (
                instance.role == User.Role.SUPER_ADMIN
                and self.request.user.role != User.Role.SUPER_ADMIN
            ):
                raise PermissionDenied("Only a super admin can change that account.")

        previous_role = instance.role
        user = serializer.save()

        audit.record(
            action="update",
            module="accounts",
            actor=self.request.user,
            record_id=user.pk,
            record_label=user.email,
            field_name="role" if previous_role != user.role else "",
            old_value=previous_role if previous_role != user.role else "",
            new_value=user.role if previous_role != user.role else "",
            request=self.request,
        )

    def perform_destroy(self, instance):
        """Accounts are deactivated, not deleted.

        Audit rows, applications and correspondence reference the actor; a
        hard delete would leave that history pointing at nothing.
        """
        self._require(perms.USERS_DELETE, "You cannot remove accounts.")

        if instance.pk == self.request.user.pk:
            raise ValidationError({"detail": "You cannot deactivate your own account."})
        if (
            instance.role == User.Role.SUPER_ADMIN
            and self.request.user.role != User.Role.SUPER_ADMIN
        ):
            raise PermissionDenied("Only a super admin can change that account.")

        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])

        audit.record(
            action="update",
            module="accounts",
            actor=self.request.user,
            record_id=instance.pk,
            record_label=instance.email,
            field_name="is_active",
            old_value="True",
            new_value="False",
            description="Account deactivated.",
            request=self.request,
        )

    @action(detail=True, methods=["post"])
    def activate(self, request, pk=None):
        self._require(perms.USERS_EDIT, "You cannot change accounts.")
        user = self.get_object()
        user.is_active = True
        user.save(update_fields=["is_active", "updated_at"])

        audit.record(
            action="update",
            module="accounts",
            actor=request.user,
            record_id=user.pk,
            record_label=user.email,
            field_name="is_active",
            old_value="False",
            new_value="True",
            request=request,
        )
        return Response(AccountSerializer(user).data)

    @action(detail=True, methods=["post"], url_path="set-password")
    def set_password(self, request, pk=None):
        """Issue a new password for someone who has lost theirs."""
        self._require(perms.USERS_EDIT, "You cannot change accounts.")

        user = self.get_object()
        if (
            user.role == User.Role.SUPER_ADMIN
            and request.user.role != User.Role.SUPER_ADMIN
        ):
            raise PermissionDenied("Only a super admin can change that account.")

        serializer = SetPasswordSerializer(data=request.data, context={"user": user})
        serializer.is_valid(raise_exception=True)

        password = serializer.validated_data.get("password") or _generate_password()
        user.set_password(password)
        user.save(update_fields=["password", "updated_at"])

        audit.record(
            action="update",
            module="accounts",
            actor=request.user,
            record_id=user.pk,
            record_label=user.email,
            field_name="password",
            description="Password reset by an administrator.",
            request=request,
        )

        # Returned once so it can be handed over; it is never stored in clear.
        return Response({"password": password})

    @action(detail=True, methods=["get"], url_path="login-history")
    def login_history(self, request, pk=None):
        self._require(perms.USERS_VIEW, "You cannot view accounts.")
        user = self.get_object()
        entries = LoginHistory.objects.filter(user=user)[:25]
        return Response(
            [
                {
                    "id": entry.id,
                    "ip_address": entry.ip_address,
                    "user_agent": entry.user_agent,
                    "successful": entry.successful,
                    "created_at": entry.created_at,
                }
                for entry in entries
            ]
        )

    @action(detail=False, methods=["get"])
    def permissions(self, request):
        """The permission catalogue, grouped for the account editor."""
        self._require(perms.USERS_VIEW, "You cannot view accounts.")

        groups: dict[str, list[str]] = {}
        for slug in sorted(ALL_PERMISSIONS):
            group = slug.split(".")[0]
            groups.setdefault(group, []).append(slug)

        return Response(
            {
                "groups": [
                    {"name": name, "permissions": slugs}
                    for name, slugs in sorted(groups.items())
                ],
                "roles": [
                    {
                        "value": value,
                        "label": label,
                        "defaults": sorted(permissions_for_role(value)),
                    }
                    for value, label in User.Role.choices
                ],
            }
        )


def _generate_password():
    """A readable temporary password an administrator can dictate."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
    return "".join(secrets.choice(alphabet) for _ in range(14))
