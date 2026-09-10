"""Document upload, verification and rejection.

Rules 2-4 of the specification: an upload notifies the assigned officer, a
rejection requires a reason and tells the customer why, and a verification
records who accepted it.
"""

from django.db import transaction
from django.utils import timezone

from applications.services import workflow
from audit import services as audit
from core.i18n import translate
from emails import services as email_service
from emails.models import EmailTemplate
from notifications import services as notify_service
from notifications.models import Notification

from .models import Document, DocumentRequest


class DocumentError(Exception):
    """An operation the document workflow does not allow."""


@transaction.atomic
def upload(application, *, document_type, uploaded_file, actor=None, request=None):
    """Rule 2 — a customer uploads a document.

    A new upload for the same type supersedes the previous one, which is kept
    so the review history stays complete.
    """
    previous = application.documents.filter(
        document_type=document_type, is_current=True
    ).first()

    document = Document.objects.create(
        application=application,
        document_type=document_type,
        file=uploaded_file,
        original_filename=getattr(uploaded_file, "name", "")[:255],
        content_type=getattr(uploaded_file, "content_type", "")[:100],
        size_bytes=getattr(uploaded_file, "size", 0) or 0,
        uploaded_by=actor,
        replaces=previous,
        is_current=True,
    )

    if previous is not None:
        previous.is_current = False
        previous.save(update_fields=["is_current", "updated_at"])

    name = translate(document_type.name)
    is_resubmission = previous is not None

    workflow.add_timeline(
        application,
        action="Document uploaded",
        description=f"{name} uploaded.",
        actor=actor,
    )

    audit.record(
        action="create",
        module="documents",
        actor=actor,
        record_id=document.pk,
        record_label=name,
        description=f"Uploaded against {application.application_number}.",
        request=request,
    )

    # Close any outstanding request for this document type.
    DocumentRequest.objects.filter(
        application=application,
        document_type=document_type,
        status=DocumentRequest.Status.PENDING,
    ).update(
        status=DocumentRequest.Status.FULFILLED,
        fulfilled_by=document,
        fulfilled_at=timezone.now(),
    )

    notify_service.notify_mis(
        category=(
            Notification.Category.DOCUMENT_RESUBMITTED
            if is_resubmission
            else Notification.Category.DOCUMENT_UPLOADED
        ),
        title="Document uploaded" if not is_resubmission else "Document resubmitted",
        message=f"{name} — {application.application_number}",
        application=application,
        link=f"/mis/applications/{application.pk}",
        play_sound=is_resubmission,
    )

    return document


@transaction.atomic
def verify(document, *, actor, request=None):
    """Rule 4 — staff accept a document."""
    if document.status == Document.Status.VERIFIED:
        return document

    document.status = Document.Status.VERIFIED
    document.verified_by = actor
    document.verified_at = timezone.now()
    document.rejection_reason = ""
    document.save(
        update_fields=[
            "status",
            "verified_by",
            "verified_at",
            "rejection_reason",
            "updated_at",
        ]
    )

    application = document.application
    name = translate(document.document_type.name)

    workflow.add_timeline(
        application,
        action="Document verified",
        description=f"{name} was verified.",
        actor=actor,
    )

    audit.record(
        action="verify",
        module="documents",
        actor=actor,
        record_id=document.pk,
        record_label=name,
        field_name="status",
        new_value=Document.Status.VERIFIED,
        request=request,
    )

    notify_service.notify(
        application.customer.user,
        category=Notification.Category.DOCUMENT_VERIFIED,
        title="Document verified",
        message=f"Your {name} has been verified.",
        application=application,
        link=f"/portal/applications/{application.pk}",
    )

    email_service.send_from_template(
        EmailTemplate.Trigger.DOCUMENT_VERIFIED,
        to_email=application.email or application.customer.user.email,
        application=application,
        extra_context={"document_name": name},
    )

    return document


@transaction.atomic
def reject(document, *, reason, actor, request=None):
    """Rule 3 — staff reject a document, always with a reason."""
    reason = (reason or "").strip()
    if not reason:
        raise DocumentError("A rejection reason is required.")

    document.status = Document.Status.REJECTED
    document.rejection_reason = reason
    document.verified_by = actor
    document.verified_at = timezone.now()
    document.save(
        update_fields=[
            "status",
            "rejection_reason",
            "verified_by",
            "verified_at",
            "updated_at",
        ]
    )

    application = document.application
    name = translate(document.document_type.name)

    workflow.add_timeline(
        application,
        action="Document rejected",
        description=f"{name} was rejected: {reason}",
        actor=actor,
    )

    audit.record(
        action="reject",
        module="documents",
        actor=actor,
        record_id=document.pk,
        record_label=name,
        field_name="status",
        new_value=Document.Status.REJECTED,
        description=reason,
        request=request,
    )

    notify_service.notify(
        application.customer.user,
        category=Notification.Category.DOCUMENT_REJECTED,
        title="Document rejected",
        message=f"Your {name} was rejected. Reason: {reason}",
        application=application,
        link=f"/portal/applications/{application.pk}",
    )

    email_service.send_from_template(
        EmailTemplate.Trigger.DOCUMENT_REJECTED,
        to_email=application.email or application.customer.user.email,
        application=application,
        extra_context={"document_name": name, "reason": reason},
    )

    return document


@transaction.atomic
def request_document(application, *, document_type, message, actor, request=None):
    """Section 29 — ask the customer for something that is missing."""
    entry = DocumentRequest.objects.create(
        application=application,
        document_type=document_type,
        message=message,
        requested_by=actor,
    )

    name = translate(document_type.name)

    workflow.add_timeline(
        application,
        action="Document requested",
        description=f"{name} requested from the customer.",
        actor=actor,
    )

    audit.record(
        action="create",
        module="document_requests",
        actor=actor,
        record_id=entry.pk,
        record_label=name,
        description=message,
        request=request,
    )

    notify_service.notify(
        application.customer.user,
        category=Notification.Category.DOCUMENT_REQUIRED,
        title="Additional document required",
        message=f"{name}: {message}" if message else name,
        application=application,
        link=f"/portal/applications/{application.pk}",
    )

    email_service.send_from_template(
        EmailTemplate.Trigger.DOCUMENT_REQUIRED,
        to_email=application.email or application.customer.user.email,
        application=application,
        extra_context={"document_name": name, "reason": message},
    )

    return entry
