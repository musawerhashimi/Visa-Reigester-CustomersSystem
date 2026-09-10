from django.db import models

from core.i18n import TranslatedField, translate
from core.models import PublishableModel, TimeStampedModel


class Country(TimeStampedModel):
    """Destination countries, shown on the public site in three languages."""

    code = models.CharField(max_length=2, unique=True, db_index=True)
    name = TranslatedField()
    flag_emoji = models.CharField(max_length=8, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        ordering = ("code",)
        verbose_name_plural = "countries"

    def __str__(self):
        return f"{translate(self.name)} ({self.code})"


class VisaCategory(PublishableModel):
    name = TranslatedField()
    description = TranslatedField(blank=True)
    slug = models.SlugField(max_length=120, unique=True)

    class Meta:
        ordering = ("display_order", "id")
        verbose_name_plural = "visa categories"

    def __str__(self):
        return translate(self.name)


class VisaType(PublishableModel):
    """A visa the company handles — a dedicated module, not a generic service."""

    class EntryType(models.TextChoices):
        SINGLE = "single", "Single Entry"
        DOUBLE = "double", "Double Entry"
        MULTIPLE = "multiple", "Multiple Entry"

    slug = models.SlugField(max_length=140, unique=True)
    name = TranslatedField()
    country = models.ForeignKey(
        Country, on_delete=models.PROTECT, related_name="visa_types"
    )
    category = models.ForeignKey(
        VisaCategory,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="visa_types",
    )

    description = TranslatedField(blank=True)
    requirements = TranslatedField(blank=True)
    application_instructions = TranslatedField(blank=True)

    processing_time = TranslatedField(blank=True)
    validity = TranslatedField(blank=True)
    entry_type = models.CharField(max_length=20, choices=EntryType.choices, blank=True)

    fee_amount = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    fee_currency = models.CharField(max_length=3, default="EUR")

    image = models.ImageField(upload_to="visas/", blank=True, null=True)
    is_featured = models.BooleanField(default=False, db_index=True)

    class Meta:
        ordering = ("display_order", "id")

    def __str__(self):
        return f"{translate(self.name)} — {translate(self.country.name)}"


class RequiredDocument(TimeStampedModel):
    """A document a given visa type expects, driving the customer's checklist."""

    visa_type = models.ForeignKey(
        VisaType, on_delete=models.CASCADE, related_name="required_documents"
    )
    document_type = models.ForeignKey(
        "documents.DocumentType", on_delete=models.CASCADE, related_name="+"
    )
    is_mandatory = models.BooleanField(default=True)
    notes = TranslatedField(blank=True)
    display_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ("display_order", "id")
        unique_together = ("visa_type", "document_type")

    def __str__(self):
        return f"{self.visa_type} requires {self.document_type}"
