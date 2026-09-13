from django.db.models import ProtectedError
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import permissions, viewsets
from rest_framework.exceptions import PermissionDenied, ValidationError

from accounts import permissions as perms
from audit import services as audit

from .models import Country, RequiredDocument, VisaCategory, VisaType
from .serializers import (
    CountrySerializer,
    RequiredDocumentWriteSerializer,
    VisaCategorySerializer,
    VisaTypeSerializer,
)


class VisaCatalogViewSet(viewsets.ModelViewSet):
    """The visa catalogue: public to read, `visas.manage` to change.

    The public site, the applicant's form and the MIS all read these
    endpoints, so the queryset—not the caller—decides what unpublished
    content is visible. Writes are how staff keep the catalogue current
    without a developer.
    """

    filter_backends = (DjangoFilterBackend,)

    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def _can_manage(self):
        user = self.request.user
        return bool(
            user and user.is_authenticated and user.has_perm_slug(perms.VISAS_MANAGE)
        )

    def _require_manage(self):
        if not self._can_manage():
            raise PermissionDenied("You cannot manage the visa catalogue.")

    def perform_create(self, serializer):
        self._require_manage()
        self._audit(serializer.save(), "create")

    def perform_update(self, serializer):
        self._require_manage()
        self._audit(serializer.save(), "update")

    def perform_destroy(self, instance):
        self._require_manage()
        try:
            instance.delete()
        except ProtectedError:
            # Applications reference their visa type for the life of the
            # record, so the catalogue entry cannot vanish underneath them.
            # Unpublishing is the way to retire one.
            raise ValidationError(
                {
                    "detail": (
                        "This is still in use and cannot be deleted. "
                        "Set it to draft to stop offering it."
                    )
                }
            )
        self._audit(instance, "delete")

    def _audit(self, instance, action_name):
        audit.record(
            action=action_name,
            module=f"visas.{instance._meta.model_name}",
            actor=self.request.user,
            record_id=instance.pk,
            record_label=str(instance)[:200],
            request=self.request,
        )


class RequiredDocumentViewSet(VisaCatalogViewSet):
    """The document checklist behind each visa type.

    Applicants read the checklist through their visa type, so this endpoint
    exists only for the staff who maintain it.
    """

    serializer_class = RequiredDocumentWriteSerializer
    pagination_class = None
    filterset_fields = ("visa_type",)

    def get_permissions(self):
        return [permissions.IsAuthenticated()]

    def initial(self, request, *args, **kwargs):
        # Check before the serializer runs, so an applicant poking at this
        # endpoint is told they may not rather than how the payload is wrong.
        super().initial(request, *args, **kwargs)
        if request.method not in permissions.SAFE_METHODS:
            self._require_manage()

    def get_queryset(self):
        if not self._can_manage():
            return RequiredDocument.objects.none()
        return RequiredDocument.objects.select_related("document_type", "visa_type")


class CountryViewSet(VisaCatalogViewSet):
    """Destination countries, readable by anyone."""

    serializer_class = CountrySerializer
    pagination_class = None
    filterset_fields = ("is_active",)

    def get_queryset(self):
        queryset = Country.objects.all()
        if self._can_manage():
            return queryset
        return queryset.filter(is_active=True)


class VisaCategoryViewSet(VisaCatalogViewSet):
    serializer_class = VisaCategorySerializer
    pagination_class = None
    filterset_fields = ("status",)

    def get_queryset(self):
        queryset = VisaCategory.objects.all()
        if self._can_manage():
            return queryset
        return queryset.filter(status=VisaCategory.Status.PUBLISHED)


class VisaTypeViewSet(VisaCatalogViewSet):
    """Visa types for the public site and the customer's application form."""

    serializer_class = VisaTypeSerializer
    lookup_field = "slug"
    filterset_fields = ("country", "category", "is_featured", "status")
    search_fields = ("slug",)

    def get_queryset(self):
        queryset = VisaType.objects.select_related("country", "category").prefetch_related(
            "required_documents__document_type"
        )
        if self._can_manage():
            return queryset
        return queryset.filter(status=VisaType.Status.PUBLISHED)
