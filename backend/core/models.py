from django.conf import settings
from django.db import models


class TimeStampedModel(models.Model):
    """Creation/update stamps carried by every record in the system."""

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class PublishableModel(TimeStampedModel):
    """Public-site content that the CMS can hold back from visitors."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        ARCHIVED = "archived", "Archived"

    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT, db_index=True
    )
    published_at = models.DateTimeField(null=True, blank=True)
    display_order = models.PositiveIntegerField(default=0)

    class Meta:
        abstract = True

    @property
    def is_public(self):
        return self.status == self.Status.PUBLISHED


class SoftDeleteQuerySet(models.QuerySet):
    def alive(self):
        return self.filter(deleted_at__isnull=True)


class SoftDeleteModel(TimeStampedModel):
    """Records the company keeps for its own history rather than erasing.

    Applications are cancelled, not deleted, so financial and audit records
    stay intact; the same applies to customers who deactivate.
    """

    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    objects = SoftDeleteQuerySet.as_manager()

    class Meta:
        abstract = True

    def soft_delete(self, user=None):
        from django.utils import timezone

        self.deleted_at = timezone.now()
        self.deleted_by = user
        self.save(update_fields=["deleted_at", "deleted_by", "updated_at"])
