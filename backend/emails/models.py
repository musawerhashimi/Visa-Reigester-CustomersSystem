from django.conf import settings
from django.db import models

from core.models import TimeStampedModel

# Placeholders staff may use in a template body; substituted at send time.
TEMPLATE_VARIABLES = (
    "customer_name",
    "application_id",
    "visa_type",
    "country",
    "status",
    "company_name",
    "application_date",
    "staff_name",
    "document_name",
    "reason",
)


class EmailTemplate(TimeStampedModel):
    """Reusable body staff can load and then edit before sending.

    Templates are English-only: they are authored in the MIS, which is
    English-only, though a future locale column would slot in here.
    """

    class Trigger(models.TextChoices):
        MANUAL = "manual", "Manual only"
        APPLICATION_SUBMITTED = "application_submitted", "Application Submitted"
        APPLICATION_RECEIVED = "application_received", "Application Received"
        DOCUMENT_REQUIRED = "document_required", "Additional Document Required"
        DOCUMENT_REJECTED = "document_rejected", "Document Rejected"
        DOCUMENT_VERIFIED = "document_verified", "Document Verified"
        APPLICATION_VERIFIED = "application_verified", "Application Verified"
        APPLICATION_APPROVED = "application_approved", "Application Approved"
        APPLICATION_REJECTED = "application_rejected", "Application Rejected"
        COMPANY_NEW_APPLICATION = "company_new_application", "Company: New Application"

    code = models.SlugField(max_length=80, unique=True)
    name = models.CharField(max_length=150)
    subject = models.CharField(max_length=255)
    body = models.TextField()
    trigger = models.CharField(
        max_length=40, choices=Trigger.choices, default=Trigger.MANUAL, db_index=True
    )
    # An automatic template fires on its trigger; switch off to make it manual.
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("name",)

    def __str__(self):
        return self.name


class EmailLog(TimeStampedModel):
    """Every email the system sent, kept as part of the application history."""

    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        SENT = "sent", "Sent"
        FAILED = "failed", "Failed"

    to_email = models.EmailField(db_index=True)
    cc = models.CharField(max_length=500, blank=True)
    subject = models.CharField(max_length=255)
    body = models.TextField()

    template = models.ForeignKey(
        EmailTemplate, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    application = models.ForeignKey(
        "applications.Application",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="emails",
    )
    customer = models.ForeignKey(
        "customers.CustomerProfile",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="emails",
    )
    sent_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="+",
    )
    is_automatic = models.BooleanField(default=True)

    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.QUEUED, db_index=True
    )
    sent_at = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.subject} → {self.to_email}"


class EmailAttachment(TimeStampedModel):
    email = models.ForeignKey(
        EmailLog, on_delete=models.CASCADE, related_name="attachments"
    )
    file = models.FileField(upload_to="email_attachments/")
    original_filename = models.CharField(max_length=255, blank=True)
    size_bytes = models.PositiveIntegerField(default=0)

    def __str__(self):
        return self.original_filename or str(self.file)
