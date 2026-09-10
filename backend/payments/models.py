from django.conf import settings
from django.db import models
from django.utils import timezone

from core.models import TimeStampedModel


class Payment(TimeStampedModel):
    """A payment recorded by staff.

    Nothing is charged online: the customer pays the company directly and a
    staff member records it here, so the MIS keeps the financial history.
    """

    class Method(models.TextChoices):
        CASH = "cash", "Cash"
        BANK_TRANSFER = "bank_transfer", "Bank Transfer"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        UNPAID = "unpaid", "Unpaid"
        PARTIAL = "partial", "Partially Paid"
        PAID = "paid", "Paid"
        REFUNDED = "refunded", "Refunded"

    application = models.ForeignKey(
        "applications.Application", on_delete=models.PROTECT, related_name="payments"
    )
    customer = models.ForeignKey(
        "customers.CustomerProfile", on_delete=models.PROTECT, related_name="payments"
    )

    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default="EUR")
    method = models.CharField(max_length=20, choices=Method.choices, default=Method.CASH)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PAID, db_index=True
    )

    paid_at = models.DateTimeField(default=timezone.now, db_index=True)
    reference = models.CharField(max_length=100, blank=True)
    note = models.TextField(blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )

    class Meta:
        ordering = ("-paid_at",)

    def __str__(self):
        return f"{self.amount} {self.currency} on {self.application.application_number}"


class Receipt(TimeStampedModel):
    """Generated document the customer can view, download, or be emailed."""

    receipt_number = models.CharField(
        max_length=30, unique=True, blank=True, db_index=True
    )
    payment = models.OneToOneField(
        Payment, on_delete=models.PROTECT, related_name="receipt"
    )
    application = models.ForeignKey(
        "applications.Application", on_delete=models.PROTECT, related_name="receipts"
    )
    pdf = models.FileField(upload_to="receipts/", blank=True, null=True)
    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    # Withheld until staff choose to release it to the portal.
    is_available_to_customer = models.BooleanField(default=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return self.receipt_number

    def save(self, *args, **kwargs):
        if not self.receipt_number:
            self.receipt_number = self._generate_number()
        super().save(*args, **kwargs)

    @staticmethod
    def _generate_number():
        from django.conf import settings as dj_settings
        from django.db import transaction

        from applications.models import NumberSequence

        prefix = getattr(dj_settings, "RECEIPT_NUMBER_PREFIX", "RCPT")
        year = timezone.now().year
        with transaction.atomic():
            counter, _ = NumberSequence.objects.select_for_update().get_or_create(
                prefix=prefix, year=year
            )
            counter.last_number += 1
            counter.save(update_fields=["last_number"])
        return f"{prefix}-{year}-{counter.last_number:06d}"


class OfficialDocument(TimeStampedModel):
    """Verification certificate or approval letter generated for an application."""

    class Kind(models.TextChoices):
        VERIFICATION = "verification", "Verification Certificate"
        APPROVAL = "approval", "Approval Document"
        OTHER = "other", "Other"

    application = models.ForeignKey(
        "applications.Application", on_delete=models.CASCADE, related_name="official_documents"
    )
    kind = models.CharField(max_length=20, choices=Kind.choices)
    title = models.CharField(max_length=200)
    pdf = models.FileField(upload_to="official/", blank=True, null=True)
    generated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    is_available_to_customer = models.BooleanField(default=False)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.get_kind_display()} · {self.application.application_number}"
