from django.db.models import Count, ProtectedError, Q
from rest_framework import permissions, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.generics import ListAPIView

from accounts import permissions as perms
from audit import services as audit

from .models import Branch
from .scoping import sees_all_branches
from .serializers import BranchSerializer, PublicBranchSerializer


class BranchViewSet(viewsets.ModelViewSet):
    """Branch administration, run from the general branch.

    Reading the list is open to any MIS user who can see branches at all —
    an officer needs the name of their own office — but only the general
    branch may create or reshape them, since a branch defining its own peers
    would undo the partition.
    """

    serializer_class = BranchSerializer
    permission_classes = (permissions.IsAuthenticated,)
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        if not user.has_perm_slug(perms.BRANCHES_VIEW):
            return Branch.objects.none()

        queryset = Branch.objects.annotate(
            application_count=Count("applications", distinct=True),
            staff_count=Count(
                "users", filter=~Q(users__role="customer"), distinct=True
            ),
        )
        if sees_all_branches(user):
            return queryset
        # A branch user sees their own office and nothing else.
        return queryset.filter(pk=user.branch_id)

    def _require_manage(self):
        user = self.request.user
        if not user.has_perm_slug(perms.BRANCHES_MANAGE) or not sees_all_branches(user):
            raise PermissionDenied("Only the general branch can manage branches.")

    def perform_create(self, serializer):
        self._require_manage()
        self._audit(serializer.save(), "create")

    def perform_update(self, serializer):
        self._require_manage()
        self._audit(serializer.save(), "update")

    def perform_destroy(self, instance):
        self._require_manage()
        if instance.is_general:
            raise ValidationError(
                {"detail": "The general branch cannot be deleted."}
            )
        try:
            instance.delete()
        except ProtectedError:
            # Applications and staff point at their branch for the life of the
            # record. Deactivating is how a closed office is retired.
            raise ValidationError(
                {
                    "detail": (
                        "This branch still has work or staff attached and "
                        "cannot be deleted. Deactivate it instead."
                    )
                }
            )
        self._audit(instance, "delete")

    def _audit(self, instance, action_name):
        audit.record(
            action=action_name,
            module="branches.branch",
            actor=self.request.user,
            record_id=instance.pk,
            record_label=str(instance)[:200],
            request=self.request,
        )


class PublicBranchListView(ListAPIView):
    """The offices an applicant can choose to apply through."""

    serializer_class = PublicBranchSerializer
    permission_classes = (permissions.AllowAny,)
    pagination_class = None
    queryset = Branch.objects.active()
