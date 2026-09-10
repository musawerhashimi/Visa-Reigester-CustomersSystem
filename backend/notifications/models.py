from django.conf import settings
from django.db import models

from core.models import TimeStampedModel


class Notification(TimeStampedModel):
    """In-app notification for either an MIS user or a customer.

    `reference_number` carries the application number so the MIS toast and the
    notification centre can link straight to the record without a join.
    """

    class Category(models.TextChoices):
        NEW_APPLICATION = "new_application", "New Application"
        NEW_CUSTOMER = "new_customer", "New Customer"
        DOCUMENT_UPLOADED = "document_uploaded", "Document Uploaded"
        DOCUMENT_RESUBMITTED = "document_resubmitted", "Document Resubmitted"
        DOCUMENT_VERIFIED = "document_verified", "Document Verified"
        DOCUMENT_REJECTED = "document_rejected", "Document Rejected"
        DOCUMENT_REQUIRED = "document_required", "Additional Document Required"
        PAYMENT = "payment", "Payment"
        APPLICATION_UPDATE = "application_update", "Application Update"
        CUSTOMER_MESSAGE = "customer_message", "Customer Message"
        CONTACT_MESSAGE = "contact_message", "Contact Message"
        RECEIPT_AVAILABLE = "receipt_available", "Receipt Available"
        SYSTEM_ALERT = "system_alert", "System Alert"

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    category = models.CharField(max_length=30, choices=Category.choices, db_index=True)
    title = models.CharField(max_length=200)
    message = models.TextField(blank=True)

    application = models.ForeignKey(
        "applications.Application",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    reference_number = models.CharField(max_length=30, blank=True)
    link = models.CharField(max_length=300, blank=True)

    read_at = models.DateTimeField(null=True, blank=True, db_index=True)
    # Drives the alert sound in the MIS; routine updates stay silent.
    play_sound = models.BooleanField(default=False)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["recipient", "read_at"])]

    def __str__(self):
        return f"{self.get_category_display()} → {self.recipient.email}"

    @property
    def is_read(self):
        return self.read_at is not None

    def mark_read(self):
        from django.utils import timezone

        if self.read_at is None:
            self.read_at = timezone.now()
            self.save(update_fields=["read_at", "updated_at"])


class Message(TimeStampedModel):
    """Thread between a customer and staff, tied to an application."""

    application = models.ForeignKey(
        "applications.Application", on_delete=models.CASCADE, related_name="messages"
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    body = models.TextField()
    # Distinguishes who wrote it without trusting a possibly-deleted sender row.
    from_customer = models.BooleanField(default=False)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("created_at",)

    def __str__(self):
        who = "customer" if self.from_customer else "staff"
        return f"Message from {who} on {self.application.application_number}"
