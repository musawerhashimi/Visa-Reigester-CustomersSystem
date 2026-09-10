"""Application lifecycle: submission, status transitions, verification.

Everything that changes an application's state goes through here rather than
through the serializers, so the timeline entry, audit row, notification and
email always travel with the change instead of depending on the caller to
remember all four.
"""

import logging

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from audit import services as audit
from emails import services as email_service
from emails.models import EmailTemplate
from notifications import services as notify_service
from notifications.models import Notification

from ..models import Application, ApplicationStatus, ApplicationTimeline

logger = logging.getLogger(__name__)


class WorkflowError(Exception):
    """A transition the workflow does not allow."""


# Which statuses may follow which. Staff can move an application forward, park
# it awaiting documents, or end it; they cannot jump from Draft to Approved.
ALLOWED_TRANSITIONS = {
    ApplicationStatus.DRAFT: {ApplicationStatus.SUBMITTED, ApplicationStatus.CANCELLED},
    ApplicationStatus.SUBMITTED: {
        ApplicationStatus.RECEIVED,
        ApplicationStatus.UNDER_REVIEW,
        ApplicationStatus.CANCELLED,
    },
    ApplicationStatus.RECEIVED: {
        ApplicationStatus.UNDER_REVIEW,
        ApplicationStatus.DOCUMENTS_REQUIRED,
        ApplicationStatus.CANCELLED,
    },
    ApplicationStatus.UNDER_REVIEW: {
        ApplicationStatus.DOCUMENTS_REQUIRED,
        ApplicationStatus.VERIFICATION,
        ApplicationStatus.REJECTED,
        ApplicationStatus.CANCELLED,
    },
    ApplicationStatus.DOCUMENTS_REQUIRED: {
        ApplicationStatus.DOCUMENTS_SUBMITTED,
        ApplicationStatus.CANCELLED,
        ApplicationStatus.WITHDRAWN,
    },
    ApplicationStatus.DOCUMENTS_SUBMITTED: {
        ApplicationStatus.UNDER_REVIEW,
        ApplicationStatus.VERIFICATION,
        ApplicationStatus.CANCELLED,
    },
    ApplicationStatus.VERIFICATION: {
        ApplicationStatus.VERIFIED,
        ApplicationStatus.DOCUMENTS_REQUIRED,
        ApplicationStatus.REJECTED,
        ApplicationStatus.CANCELLED,
    },
    ApplicationStatus.VERIFIED: {
        ApplicationStatus.PROCESSING,
        ApplicationStatus.CANCELLED,
    },
    ApplicationStatus.PROCESSING: {
        ApplicationStatus.SUBMITTED_TO_AUTHORITY,
        ApplicationStatus.DECISION_PENDING,
        ApplicationStatus.APPROVED,
        ApplicationStatus.REJECTED,
        ApplicationStatus.CANCELLED,
    },
    ApplicationStatus.SUBMITTED_TO_AUTHORITY: {
        ApplicationStatus.DECISION_PENDING,
        ApplicationStatus.APPROVED,
        ApplicationStatus.REJECTED,
    },
    ApplicationStatus.DECISION_PENDING: {
        ApplicationStatus.APPROVED,
        ApplicationStatus.REJECTED,
    },
    ApplicationStatus.APPROVED: {ApplicationStatus.COMPLETED},
    # Terminal.
    ApplicationStatus.COMPLETED: set(),
    ApplicationStatus.REJECTED: set(),
    ApplicationStatus.CANCELLED: set(),
    ApplicationStatus.WITHDRAWN: set(),
}

# Status changes the customer should hear about by email.
STATUS_EMAIL_TRIGGERS = {
    ApplicationStatus.VERIFIED: EmailTemplate.Trigger.APPLICATION_VERIFIED,
    ApplicationStatus.APPROVED: EmailTemplate.Trigger.APPLICATION_APPROVED,
    ApplicationStatus.REJECTED: EmailTemplate.Trigger.APPLICATION_REJECTED,
}


def add_timeline(application, *, action, description="", actor=None, from_status="", to_status="", visible=True):
    return ApplicationTimeline.objects.create(
        application=application,
        actor=actor,
        action=action,
        description=description,
        from_status=from_status,
        to_status=to_status,
        visible_to_customer=visible,
    )


@transaction.atomic
def submit(application, *, actor=None, request=None):
    """Rule 1 — a customer submits their application.

    Assigns the number, notifies the desk with an audible alert, and emails
    both the customer and the company.
    """
    if application.status != ApplicationStatus.DRAFT:
        raise WorkflowError("Only a draft application can be submitted.")

    missing = missing_mandatory_documents(application)
    if missing:
        names = ", ".join(missing)
        raise WorkflowError(f"Upload the required documents first: {names}.")

    application.status = ApplicationStatus.SUBMITTED
    application.submitted_at = timezone.now()
    application.save(update_fields=["status", "submitted_at", "updated_at"])

    add_timeline(
        application,
        action="Application submitted",
        description=f"Application {application.application_number} was submitted.",
        actor=actor,
        from_status=ApplicationStatus.DRAFT,
        to_status=ApplicationStatus.SUBMITTED,
    )

    audit.record(
        action="status_change",
        module="applications",
        actor=actor,
        record_id=application.pk,
        record_label=application.application_number,
        field_name="status",
        old_value=ApplicationStatus.DRAFT,
        new_value=ApplicationStatus.SUBMITTED,
        description="Application submitted by customer.",
        request=request,
    )

    visa = _visa_label(application)
    notify_service.notify_mis(
        category=Notification.Category.NEW_APPLICATION,
        title="New visa application",
        message=f"{application.full_name} — {visa}",
        application=application,
        link=f"/mis/applications/{application.pk}",
        play_sound=True,
    )

    _send_customer_email(
        application, EmailTemplate.Trigger.APPLICATION_SUBMITTED
    )
    _send_company_email(application)

    return application


@transaction.atomic
def change_status(application, new_status, *, actor=None, request=None, note=""):
    """Move an application along the workflow, with all the side effects."""
    old_status = application.status
    if new_status == old_status:
        return application

    allowed = ALLOWED_TRANSITIONS.get(old_status, set())
    if new_status not in allowed:
        raise WorkflowError(
            f"Cannot move an application from '{old_status}' to '{new_status}'."
        )

    application.status = new_status
    updates = ["status", "updated_at"]

    if new_status == ApplicationStatus.VERIFIED:
        application.verified_at = timezone.now()
        updates.append("verified_at")
    if new_status in (ApplicationStatus.APPROVED, ApplicationStatus.REJECTED):
        application.decided_at = timezone.now()
        updates.append("decided_at")
    if new_status == ApplicationStatus.REJECTED and note:
        application.rejection_reason = note
        updates.append("rejection_reason")
    if new_status == ApplicationStatus.CANCELLED and note:
        application.cancellation_reason = note
        updates.append("cancellation_reason")

    application.save(update_fields=updates)

    add_timeline(
        application,
        action=f"Status changed to {application.get_status_display()}",
        description=note,
        actor=actor,
        from_status=old_status,
        to_status=new_status,
    )

    audit.record(
        action="status_change",
        module="applications",
        actor=actor,
        record_id=application.pk,
        record_label=application.application_number,
        field_name="status",
        old_value=old_status,
        new_value=new_status,
        description=note,
        request=request,
    )

    notify_service.notify(
        application.customer.user,
        category=Notification.Category.APPLICATION_UPDATE,
        title="Application status updated",
        message=(
            f"{application.application_number} is now "
            f"{application.get_status_display()}."
        ),
        application=application,
        link=f"/portal/applications/{application.pk}",
    )

    trigger = STATUS_EMAIL_TRIGGERS.get(new_status)
    if trigger:
        _send_customer_email(application, trigger, extra={"reason": note})

    return application


@transaction.atomic
def assign(application, staff, *, actor=None, request=None, priority=None):
    """Give an application an owner so two officers do not duplicate work."""
    previous = application.assigned_to
    application.assigned_to = staff
    application.assigned_at = timezone.now()
    updates = ["assigned_to", "assigned_at", "updated_at"]

    if priority:
        application.priority = priority
        updates.append("priority")

    application.save(update_fields=updates)

    add_timeline(
        application,
        action="Application assigned",
        description=f"Assigned to {staff.get_full_name() or staff.email}.",
        actor=actor,
        visible=False,
    )

    audit.record(
        action="assign",
        module="applications",
        actor=actor,
        record_id=application.pk,
        record_label=application.application_number,
        field_name="assigned_to",
        old_value=(previous.email if previous else ""),
        new_value=staff.email,
        request=request,
    )

    notify_service.notify(
        staff,
        category=Notification.Category.APPLICATION_UPDATE,
        title="Application assigned to you",
        message=f"{application.application_number} — {application.full_name}",
        application=application,
        link=f"/mis/applications/{application.pk}",
        play_sound=True,
    )
    return application


@transaction.atomic
def cancel(application, *, reason, actor=None, request=None):
    """Section 17: applications are cancelled, never deleted."""
    if application.is_terminal:
        raise WorkflowError("This application has already been closed.")
    return change_status(
        application,
        ApplicationStatus.CANCELLED,
        actor=actor,
        request=request,
        note=reason,
    )


def missing_mandatory_documents(application):
    """Names of required document types with no acceptable upload yet.

    A rejected upload does not count, so a customer cannot submit by attaching
    a file that staff already turned down.
    """
    from core.i18n import translate
    from documents.models import Document

    usable = {
        Document.Status.PENDING,
        Document.Status.VERIFIED,
    }
    uploaded = set(
        application.documents.filter(is_current=True, status__in=usable).values_list(
            "document_type_id", flat=True
        )
    )
    required = application.visa_type.required_documents.filter(
        is_mandatory=True
    ).select_related("document_type")

    return [
        translate(item.document_type.name)
        for item in required
        if item.document_type_id not in uploaded
    ]


def _visa_label(application):
    from core.i18n import translate

    return (
        f"{translate(application.visa_type.name)} — "
        f"{translate(application.visa_type.country.name)}"
    )


def _send_customer_email(application, trigger, extra=None):
    recipient = application.email or application.customer.user.email
    if not recipient:
        return None
    return email_service.send_from_template(
        trigger,
        to_email=recipient,
        application=application,
        extra_context=extra,
    )


def _send_company_email(application):
    """Rule 1 — tell the office even when nobody has the MIS open."""
    recipient = getattr(settings, "COMPANY_NOTIFICATION_EMAIL", "")
    if not recipient:
        return None

    sent = email_service.send_from_template(
        EmailTemplate.Trigger.COMPANY_NEW_APPLICATION,
        to_email=recipient,
        application=application,
    )
    if sent is not None:
        return sent

    # No template configured: the office still needs to know, so fall back to
    # a plain built-in message rather than staying silent.
    return email_service.send_email(
        to_email=recipient,
        subject=f"New visa application – {application.application_number}",
        body=(
            f"Customer: {application.full_name}\n"
            f"Visa: {_visa_label(application)}\n"
            f"Phone: {application.phone}\n"
            f"Email: {application.email}\n"
            f"Application: {application.application_number}\n"
        ),
        application=application,
    )
