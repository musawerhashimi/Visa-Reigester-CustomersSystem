from django.db import models
from rest_framework import mixins, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError

from accounts import permissions as perms
from applications.models import Application
from core.permissions import IsMISUser

from .models import InternalNote
from .serializers import InternalNoteSerializer


class InternalNoteViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Staff-only notes on an application (section 27).

    Restricted to MIS users at the class level rather than filtered per row:
    these are never customer-visible under any circumstance, so the safe
    default is that a customer account cannot reach the endpoint at all.
    """

    serializer_class = InternalNoteSerializer
    permission_classes = (IsMISUser,)

    def get_queryset(self):
        queryset = InternalNote.objects.select_related(
            "author", "customer__user"
        ).order_by("-created_at")

        application_id = self.request.query_params.get("application")
        if application_id:
            queryset = queryset.filter(application_id=application_id)

        user = self.request.user
        if user.has_perm_slug(perms.APPLICATIONS_VIEW):
            return queryset
        # Notes follow the same scope as the applications an officer can open:
        # their own workload plus unclaimed work. Filtering to assigned-only
        # would let an officer write a note on a new application and then not
        # see it, since new applications arrive unassigned.
        return queryset.filter(
            models.Q(application__assigned_to=user)
            | models.Q(application__assigned_to__isnull=True)
        )

    def perform_create(self, serializer):
        application_id = self.request.data.get("application")
        application = Application.objects.filter(pk=application_id).first()
        if application is None:
            raise ValidationError({"application": "Unknown application."})

        # Writing a note follows the same scope as reading one, so an officer
        # cannot annotate a colleague's case.
        user = self.request.user
        if not user.has_perm_slug(perms.APPLICATIONS_VIEW) and application.assigned_to_id not in (
            user.id,
            None,
        ):
            raise PermissionDenied("This application is assigned to another officer.")

        serializer.save(
            author=self.request.user,
            application=application,
            customer=application.customer,
        )
