from django.conf import settings
from django.db import models, transaction
from django.utils import timezone

from core.models import SoftDeleteModel, TimeStampedModel


class ApplicationStatus(models.TextChoices):
    """The workflow from section 14 of the specification."""

    DRAFT = "draft", "Draft"
    SUBMITTED = "submitted", "Submitted"
    RECEIVED = "received", "Received"
    UNDER_REVIEW = "under_review", "Under Review"
    DOCUMENTS_REQUIRED = "documents_required", "Documents Required"
    DOCUMENTS_SUBMITTED = "documents_submitted", "Documents Submitted"
    VERIFICATION = "verification", "Verification"
    VERIFIED = "verified", "Verified"
    PROCESSING = "processing", "Processing"
    SUBMITTED_TO_AUTHORITY = "submitted_to_authority", "Submitted to Embassy / Authority"
    DECISION_PENDING = "decision_pending", "Decision Pending"
    APPROVED = "approved", "Approved"
    COMPLETED = "completed", "Completed"
    REJECTED = "rejected", "Rejected"
    CANCELLED = "cancelled", "Cancelled"
    WITHDRAWN = "withdrawn", "Withdrawn"


# Statuses past which the customer may no longer edit critical application data
# (section 16): once staff have started verifying, changes go through a request.
LOCKED_FOR_CUSTOMER = frozenset(
    {
        ApplicationStatus.VERIFICATION,
        ApplicationStatus.VERIFIED,
        ApplicationStatus.PROCESSING,
        ApplicationStatus.SUBMITTED_TO_AUTHORITY,
        ApplicationStatus.DECISION_PENDING,
        ApplicationStatus.APPROVED,
        ApplicationStatus.COMPLETED,
        ApplicationStatus.REJECTED,
        ApplicationStatus.CANCELLED,
        ApplicationStatus.WITHDRAWN,
    }
)

TERMINAL_STATUSES = frozenset(
    {
        ApplicationStatus.COMPLETED,
        ApplicationStatus.REJECTED,
        ApplicationStatus.CANCELLED,
        ApplicationStatus.WITHDRAWN,
    }
)


class Application(SoftDeleteModel):
    """A customer's visa request — the record every other module hangs off."""

    class Priority(models.TextChoices):
        LOW = "low", "Low"
        NORMAL = "normal", "Normal"
        HIGH = "high", "High"
        URGENT = "urgent", "Urgent"

    application_number = models.CharField(
        max_length=30, unique=True, blank=True, db_index=True
    )
    customer = models.ForeignKey(
        "customers.CustomerProfile", on_delete=models.PROTECT, related_name="applications"
    )
    visa_type = models.ForeignKey(
        "visas.VisaType", on_delete=models.PROTECT, related_name="applications"
    )
    # The office handling this application, chosen by the applicant when they
    # apply. Every downstream record — documents, emails, payments — inherits
    # its branch from here rather than storing its own.
    branch = models.ForeignKey(
        "branches.Branch",
        on_delete=models.PROTECT,
        related_name="applications",
        db_index=True,
    )

    status = models.CharField(
        max_length=30,
        choices=ApplicationStatus.choices,
        default=ApplicationStatus.DRAFT,
        db_index=True,
    )
    priority = models.CharField(
        max_length=10, choices=Priority.choices, default=Priority.NORMAL, db_index=True
    )
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="assigned_applications",
    )
    assigned_at = models.DateTimeField(null=True, blank=True)

    # Personal information, snapshotted onto the application: the customer's
    # profile may change later, but an application must keep what was declared.
    first_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100)
    father_name = models.CharField(max_length=100, blank=True)
    mother_name = models.CharField(max_length=100, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    place_of_birth = models.CharField(max_length=120, blank=True)
    gender = models.CharField(max_length=10, blank=True)
    nationality = models.CharField(max_length=100, blank=True)
    marital_status = models.CharField(max_length=30, blank=True)

    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    alternative_phone = models.CharField(max_length=30, blank=True)
    current_address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, blank=True)

    passport_number = models.CharField(max_length=50, blank=True, db_index=True)
    passport_type = models.CharField(max_length=50, blank=True)
    passport_issue_date = models.DateField(null=True, blank=True)
    passport_expiry_date = models.DateField(null=True, blank=True)
    passport_issue_country = models.CharField(max_length=100, blank=True)

    purpose_of_travel = models.TextField(blank=True)
    expected_travel_date = models.DateField(null=True, blank=True)
    expected_return_date = models.DateField(null=True, blank=True)
    previous_visa = models.TextField(blank=True)
    previous_travel_history = models.TextField(blank=True)

    education = models.CharField(max_length=200, blank=True)
    occupation = models.CharField(max_length=200, blank=True)
    employer = models.CharField(max_length=200, blank=True)
    emergency_contact = models.CharField(max_length=200, blank=True)
    additional_notes = models.TextField(blank=True)

    submitted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)
    cancellation_reason = models.TextField(blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=["status", "-created_at"]),
            models.Index(fields=["assigned_to", "status"]),
        ]

    def __str__(self):
        return f"{self.application_number} · {self.full_name}"

    @property
    def full_name(self):
        parts = [self.first_name, self.middle_name, self.last_name]
        return " ".join(part for part in parts if part)

    @property
    def is_editable_by_customer(self):
        return self.status not in LOCKED_FOR_CUSTOMER

    @property
    def is_terminal(self):
        return self.status in TERMINAL_STATUSES

    def save(self, *args, **kwargs):
        if not self.application_number:
            self.application_number = self.generate_number()
        if self.branch_id is None:
            # Applications created outside the portal form — by an importer or
            # by staff — fall to the head office rather than being rejected.
            from branches.models import Branch

            self.branch = Branch.general()
        super().save(*args, **kwargs)

    @staticmethod
    @transaction.atomic
    def generate_number():
        """Sequential per year: VISA-2026-000001.

        Locks the counter row so two applications submitted in the same instant
        cannot claim the same number.
        """
        from django.conf import settings as dj_settings

        prefix = getattr(dj_settings, "APPLICATION_NUMBER_PREFIX", "VISA")
        year = timezone.now().year
        counter, _ = NumberSequence.objects.select_for_update().get_or_create(
            prefix=prefix, year=year
        )
        counter.last_number += 1
        counter.save(update_fields=["last_number"])
        return f"{prefix}-{year}-{counter.last_number:06d}"


class NumberSequence(models.Model):
    """Per-prefix, per-year counter behind application and receipt numbers."""

    prefix = models.CharField(max_length=20)
    year = models.PositiveIntegerField()
    last_number = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ("prefix", "year")

    def __str__(self):
        return f"{self.prefix}-{self.year}: {self.last_number}"


class ApplicationTimeline(TimeStampedModel):
    """Customer-visible history of what happened to an application."""

    application = models.ForeignKey(
        Application, on_delete=models.CASCADE, related_name="timeline"
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    action = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    from_status = models.CharField(max_length=30, blank=True)
    to_status = models.CharField(max_length=30, blank=True)
    visible_to_customer = models.BooleanField(default=True)

    class Meta:
        ordering = ("created_at",)

    def __str__(self):
        return f"{self.application.application_number}: {self.action}"


class ChangeRequest(TimeStampedModel):
    """A customer's request to alter data that is locked after verification."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"

    application = models.ForeignKey(
        Application, on_delete=models.CASCADE, related_name="change_requests"
    )
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    field_name = models.CharField(max_length=100)
    current_value = models.TextField(blank=True)
    requested_value = models.TextField()
    reason = models.TextField(blank=True)

    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_note = models.TextField(blank=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"Change '{self.field_name}' on {self.application.application_number}"
