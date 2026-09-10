import uuid

from django.conf import settings
from django.db import models

from core.i18n import TranslatedField, translate
from core.models import TimeStampedModel


def document_upload_path(instance, filename):
    """Unguessable path per file.

    Files are additionally served through a permission-checked view rather
    than straight off the media directory, but an opaque path means a leaked
    URL is not automatically a leaked document.
    """
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    return f"documents/{instance.application_id}/{uuid.uuid4().hex}.{extension}"


class DocumentType(TimeStampedModel):
    """Passport, bank statement, admission letter, and so on."""

    code = models.SlugField(max_length=60, unique=True)
    name = TranslatedField()
    description = TranslatedField(blank=True)
    is_active = models.BooleanField(default=True)
    display_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ("display_order", "id")

    def __str__(self):
        return translate(self.name) or self.code


class Document(TimeStampedModel):
    """A file a customer uploaded against one application."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        VERIFIED = "verified", "Verified"
        REJECTED = "rejected", "Rejected"
        RESUBMIT_REQUIRED = "resubmit_required", "Resubmit Required"

    application = models.ForeignKey(
        "applications.Application", on_delete=models.CASCADE, related_name="documents"
    )
    document_type = models.ForeignKey(
        DocumentType, on_delete=models.PROTECT, related_name="documents"
    )

    file = models.FileField(upload_to=document_upload_path)
    original_filename = models.CharField(max_length=255, blank=True)
    content_type = models.CharField(max_length=100, blank=True)
    size_bytes = models.PositiveIntegerField(default=0)

    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True
    )
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="verified_documents",
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)

    # Superseded uploads are kept so the review history stays complete.
    replaces = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.SET_NULL, related_name="replaced_by"
    )
    is_current = models.BooleanField(default=True, db_index=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["application", "status"])]

    def __str__(self):
        return f"{self.document_type} for {self.application.application_number}"

    def is_accessible_by(self, user):
        """Section 61: nobody reaches a document without an explicit reason.

        A customer sees only their own files; a visa officer sees the ones on
        applications assigned to them, unless granted the wider view.
        """
        from accounts import permissions as perms

        if not user or not user.is_authenticated:
            return False
        if user.role == user.Role.SUPER_ADMIN:
            return True
        if user.is_customer:
            return self.application.customer.user_id == user.id
        if user.has_perm_slug(perms.DOCUMENTS_VIEW):
            if user.has_perm_slug(perms.APPLICATIONS_VIEW):
                return True
            return self.application.assigned_to_id == user.id
        return False


class DocumentRequest(TimeStampedModel):
    """Staff asking a customer for a document that is missing or unusable."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        FULFILLED = "fulfilled", "Fulfilled"
        CANCELLED = "cancelled", "Cancelled"

    application = models.ForeignKey(
        "applications.Application",
        on_delete=models.CASCADE,
        related_name="document_requests",
    )
    document_type = models.ForeignKey(
        DocumentType, on_delete=models.PROTECT, related_name="requests"
    )
    message = models.TextField(blank=True)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True
    )
    fulfilled_by = models.ForeignKey(
        Document, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    fulfilled_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"Request {self.document_type} on {self.application.application_number}"
