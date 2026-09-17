from django.contrib.auth import get_user_model
from django.db import models
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from accounts import permissions as perms
from branches.models import Branch
from branches.scoping import scope_to_branch, sees_all_branches
from core.permissions import IsOwnerOrMIS

from .models import Application
from .serializers import (
    AssignSerializer,
    ApplicationDetailSerializer,
    ApplicationListSerializer,
    CancelSerializer,
    StatusChangeSerializer,
)
from .services import workflow

User = get_user_model()


class ApplicationViewSet(viewsets.ModelViewSet):
    """Applications, scoped to what the caller is allowed to see.

    One viewset serves both the portal and the MIS: the queryset narrows by
    role, so a customer physically cannot address another customer's record
    even by guessing its id.
    """

    permission_classes = (IsOwnerOrMIS,)
    filter_backends = (DjangoFilterBackend,)
    filterset_fields = ("status", "priority", "visa_type", "assigned_to", "branch")
    search_fields = (
        "application_number",
        "first_name",
        "last_name",
        "email",
        "phone",
        "passport_number",
    )
    ordering_fields = ("created_at", "submitted_at", "priority", "status")

    def get_serializer_class(self):
        if self.action == "list":
            return ApplicationListSerializer
        return ApplicationDetailSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = (
            Application.objects.alive()
            .select_related(
                "customer__user", "visa_type__country", "visa_type", "assigned_to", "branch"
            )
            .prefetch_related("documents__document_type")
        )

        if user.is_customer:
            return queryset.filter(customer__user=user)

        # Staff see only their own branch's work unless they sit in the
        # general branch. This narrows every staff path below it.
        queryset = scope_to_branch(queryset, user)

        if user.has_perm_slug(perms.APPLICATIONS_VIEW):
            return queryset

        # An officer sees their own workload plus anything unclaimed, in the
        # list as well as the detail view: new applications arrive unassigned,
        # so hiding them from the list would leave the alerted officer staring
        # at an empty queue. Work assigned to a colleague stays hidden.
        if user.has_perm_slug(perms.APPLICATIONS_VIEW_ASSIGNED):
            return queryset.filter(
                models.Q(assigned_to=user) | models.Q(assigned_to__isnull=True)
            )
        return queryset.none()

    def perform_create(self, serializer):
        user = self.request.user
        if not user.is_customer:
            raise PermissionDenied("Only customers can create applications here.")

        profile = getattr(user, "customer_profile", None)
        if profile is None:
            raise ValidationError("Your customer profile is incomplete.")

        # Applications always start as drafts; submission is its own step.
        serializer.save(customer=profile)

    def perform_destroy(self, instance):
        raise PermissionDenied(
            "Applications are cancelled rather than deleted. Use the cancel action."
        )

    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        application = self.get_object()
        if request.user.is_customer and application.customer.user_id != request.user.id:
            raise PermissionDenied("This is not your application.")

        try:
            workflow.submit(application, actor=request.user, request=request)
        except workflow.WorkflowError as error:
            return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)

        serializer = self.get_serializer(application)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="change-status")
    def change_status(self, request, pk=None):
        if not request.user.has_perm_slug(perms.APPLICATIONS_EDIT):
            raise PermissionDenied("You cannot change application statuses.")

        application = self.get_object()
        serializer = StatusChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Verifying and deciding are separately permissioned, so that editing
        # an application does not imply the authority to approve it.
        target = serializer.validated_data["status"]
        required = workflow.STATUS_PERMISSIONS.get(target)
        if required and not request.user.has_perm_slug(required):
            raise PermissionDenied(
                f"You cannot move an application to '{target}'."
            )

        try:
            workflow.change_status(
                application,
                serializer.validated_data["status"],
                actor=request.user,
                request=request,
                note=serializer.validated_data.get("note", ""),
            )
        except workflow.WorkflowError as error:
            return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(self.get_serializer(application).data)

    @action(detail=True, methods=["post"])
    def assign(self, request, pk=None):
        if not request.user.has_perm_slug(perms.APPLICATIONS_ASSIGN):
            raise PermissionDenied("You cannot assign applications.")

        application = self.get_object()
        serializer = AssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        staff = User.objects.filter(
            pk=serializer.validated_data["staff_id"], is_active=True
        ).first()
        if staff is None or staff.is_customer:
            raise ValidationError({"staff_id": "Select an active staff account."})

        workflow.assign(
            application,
            staff,
            actor=request.user,
            request=request,
            priority=serializer.validated_data.get("priority"),
        )
        return Response(self.get_serializer(application).data)

    @action(detail=True, methods=["post"])
    def transfer(self, request, pk=None):
        """Move an application to another branch.

        Held to the general branch: a branch moving work to itself, or pushing
        its backlog elsewhere, is not a decision a single office should make.
        """
        if not sees_all_branches(request.user) or not request.user.has_perm_slug(
            perms.APPLICATIONS_ASSIGN
        ):
            raise PermissionDenied("You cannot transfer applications between branches.")

        application = self.get_object()
        branch = Branch.objects.active().filter(pk=request.data.get("branch_id")).first()
        if branch is None:
            raise ValidationError({"branch_id": "Select an active branch."})

        try:
            workflow.transfer(application, branch, actor=request.user, request=request)
        except workflow.WorkflowError as exc:
            raise ValidationError({"detail": str(exc)})
        return Response(self.get_serializer(application).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        application = self.get_object()
        serializer = CancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            workflow.cancel(
                application,
                reason=serializer.validated_data["reason"],
                actor=request.user,
                request=request,
            )
        except workflow.WorkflowError as error:
            return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(self.get_serializer(application).data)
