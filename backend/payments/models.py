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

    class Kind(models.TextChoices):
        """What the money is for.

        The two fees are charged at different points in the workflow — the
        registration fee once documents arrive, the visa fee at verification —
        so they are distinguished here rather than in a free-text note, and
        each can be billed only once per application.
        """

        REGISTRATION = "registration", "Registration Fee"
        VISA_FEE = "visa_fee", "Visa Processing Fee"
        OTHER = "other", "Other"

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
    kind = models.CharField(
        max_length=20, choices=Kind.choices, default=Kind.OTHER, db_index=True
    )

    # The account the customer pays into, printed on the bill so they know
    # where to send the money. A bank or transfer reference, never a card
    # number: storing those would put the company under PCI-DSS.
    card_number = models.CharField(
        max_length=64,
        blank=True,
        verbose_name="Account / card number to pay into",
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
    """Generated document the customer can view, download, or be emailed.

    Covers both halves of the exchange: a bill asking for money, and a receipt
    confirming it arrived. Which one it is follows the payment's status, so the
    document cannot claim to be paid while the payment says otherwise.
    """

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

    @property
    def is_bill(self):
        """Unpaid means this is a request for money, not proof of it."""
        return self.payment.status != Payment.Status.PAID

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
