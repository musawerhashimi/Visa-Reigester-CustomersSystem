from django.conf import settings
from django.db import models

from core.models import TimeStampedModel


class AuditLog(TimeStampedModel):
    """Who changed what, kept for accountability (section 46).

    Rows are written by services, never edited, and the actor is nulled rather
    than cascaded so removing a staff account cannot erase their history.
    """

    class Action(models.TextChoices):
        CREATE = "create", "Created"
        UPDATE = "update", "Updated"
        DELETE = "delete", "Deleted"
        STATUS_CHANGE = "status_change", "Status Changed"
        VERIFY = "verify", "Verified"
        REJECT = "reject", "Rejected"
        ASSIGN = "assign", "Assigned"
        LOGIN = "login", "Logged In"
        EMAIL_SENT = "email_sent", "Email Sent"
        EXPORT = "export", "Exported"

    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+"
    )
    actor_label = models.CharField(max_length=200, blank=True)

    action = models.CharField(max_length=30, choices=Action.choices, db_index=True)
    module = models.CharField(max_length=60, db_index=True)
    record_id = models.CharField(max_length=60, blank=True, db_index=True)
    record_label = models.CharField(max_length=200, blank=True)

    field_name = models.CharField(max_length=100, blank=True)
    old_value = models.TextField(blank=True)
    new_value = models.TextField(blank=True)
    description = models.TextField(blank=True)

    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=400, blank=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["module", "record_id", "-created_at"])]

    def __str__(self):
        return f"{self.actor_label or 'system'} {self.action} {self.module}#{self.record_id}"
