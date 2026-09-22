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
        # Django clears the pk on delete, so what the audit trail needs to
        # identify the record has to be read while the row still exists.
        record_id, record_label = instance.pk, str(instance)[:200]
        try:
            instance.delete()
        except ProtectedError as exc:
            # Applications reference their visa type for the life of the
            # record, so the catalogue entry cannot vanish underneath them.
            # Drafting is what retires one — but say so only when it is still
            # published, since telling someone to draft what they have already
            # drafted reads as though the refusal were their mistake.
            raise ValidationError({"detail": self._in_use_message(instance, exc)})
        audit.record(
            action="delete",
            module=f"visas.{instance._meta.model_name}",
            actor=self.request.user,
            record_id=record_id,
            record_label=record_label,
            request=self.request,
        )

    def _in_use_message(self, instance, exc):
        """Why this record is pinned, and what the caller can still do.

        `ProtectedError.protected_objects` holds the rows standing in the
        way, so the refusal can name them and their number rather than
        leaving staff to guess what "in use" means.
        """
        protected = list(exc.protected_objects)
        if protected:
            meta = protected[0]._meta
            noun = meta.verbose_name if len(protected) == 1 else meta.verbose_name_plural
            count = f"{len(protected)} {noun}"
        else:
            count = "other records"

        already_retired = getattr(instance, "status", None) in {
            "draft",
            "archived",
        }
        count = count[0].upper() + count[1:]
        if already_retired:
            # Already off the application form; there is nothing further to
            # do, so the message stops rather than offering a dead end.
            return (
                f"{count} still reference this, so it cannot be deleted. "
                "It is already a draft, so it is not offered to new "
                "applicants — it stays here for their history."
            )
        return (
            f"{count} still reference this, so it cannot be deleted. "
            "Set it to draft to stop offering it to new applicants."
        )

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
