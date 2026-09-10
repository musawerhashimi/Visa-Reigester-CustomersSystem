from django.conf import settings
from django.db import models

from core.models import SoftDeleteModel, TimeStampedModel


class CustomerProfile(SoftDeleteModel):
    """Everything about a customer that is not login credentials.

    Split from User so MIS staff records and customer records do not share a
    table of half-relevant columns, and so a customer can be archived without
    touching their account row.
    """

    class Gender(models.TextChoices):
        MALE = "male", "Male"
        FEMALE = "female", "Female"
        OTHER = "other", "Other"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        INACTIVE = "inactive", "Inactive"
        ARCHIVED = "archived", "Archived"

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="customer_profile"
    )
    customer_code = models.CharField(max_length=30, unique=True, blank=True, db_index=True)

    father_name = models.CharField(max_length=100, blank=True)
    mother_name = models.CharField(max_length=100, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    place_of_birth = models.CharField(max_length=120, blank=True)
    gender = models.CharField(max_length=10, choices=Gender.choices, blank=True)
    nationality = models.CharField(max_length=100, blank=True, db_index=True)
    marital_status = models.CharField(max_length=30, blank=True)

    alternative_phone = models.CharField(max_length=30, blank=True)
    address = models.TextField(blank=True)
    city = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, blank=True, db_index=True)

    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.ACTIVE, db_index=True
    )
    assigned_staff = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="assigned_customers",
        limit_choices_to={"role__in": ["admin", "visa_officer", "super_admin"]},
    )

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.customer_code or 'CUST-?'} · {self.user.get_full_name() or self.user.email}"

    def save(self, *args, **kwargs):
        if not self.customer_code:
            self.customer_code = self._next_code()
        super().save(*args, **kwargs)

    @staticmethod
    def _next_code():
        from django.db.models.functions import Cast

        last = (
            CustomerProfile.objects.filter(customer_code__startswith="CUST-")
            .order_by("-id")
            .values_list("customer_code", flat=True)
            .first()
        )
        sequence = int(last.split("-")[-1]) + 1 if last else 1
        return f"CUST-{sequence:06d}"


class InternalNote(TimeStampedModel):
    """Staff-only notes. Never exposed on any customer-facing endpoint."""

    customer = models.ForeignKey(
        CustomerProfile, on_delete=models.CASCADE, related_name="notes"
    )
    application = models.ForeignKey(
        "applications.Application",
        null=True,
        blank=True,
        on_delete=models.CASCADE,
        related_name="notes",
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    body = models.TextField()

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"Note on {self.customer} by {self.author or 'deleted user'}"
