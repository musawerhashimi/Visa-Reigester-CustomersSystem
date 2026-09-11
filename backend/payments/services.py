"""Recording payments and issuing receipts and official documents.

No money moves through this system: a customer pays the office directly and
a staff member records it here, so the MIS keeps the financial history.
"""

from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone

from applications.services import workflow
from audit import services as audit
from emails import services as email_service
from notifications import services as notify_service
from notifications.models import Notification

from . import pdf
from .models import OfficialDocument, Payment, Receipt


class PaymentError(Exception):
    """An operation the payment workflow does not allow."""


@transaction.atomic
def record_payment(
    application,
    *,
    amount,
    currency="EUR",
    method=Payment.Method.CASH,
    status=Payment.Status.PAID,
    paid_at=None,
    reference="",
    note="",
    actor=None,
    request=None,
    issue_receipt=True,
):
    """Record a payment and, by default, issue its receipt."""
    if amount is None or amount <= 0:
        raise PaymentError("The amount must be greater than zero.")

    payment = Payment.objects.create(
        application=application,
        customer=application.customer,
        amount=amount,
        currency=currency,
        method=method,
        status=status,
        paid_at=paid_at or timezone.now(),
        reference=reference,
        note=note,
        recorded_by=actor,
    )

    workflow.add_timeline(
        application,
        action="Payment recorded",
        description=f"{amount} {currency} ({payment.get_method_display()}).",
        actor=actor,
    )

    audit.record(
        action="create",
        module="payments",
        actor=actor,
        record_id=payment.pk,
        record_label=f"{amount} {currency}",
        description=f"Recorded against {application.application_number}.",
        request=request,
    )

    receipt = None
    # Only a settled payment earns a receipt; an unpaid record is a note that
    # money is owed, and issuing a receipt for it would be misleading.
    if issue_receipt and status == Payment.Status.PAID:
        receipt = issue_receipt_for(payment, actor=actor, request=request)

    notify_service.notify(
        application.customer.user,
        category=Notification.Category.PAYMENT,
        title="Payment recorded",
        message=f"We have recorded your payment of {amount} {currency}.",
        application=application,
        link=f"/portal/applications/{application.pk}",
    )

    return payment, receipt


@transaction.atomic
def issue_receipt_for(payment, *, actor=None, request=None):
    """Generate the receipt PDF for a payment, once."""
    existing = Receipt.objects.filter(payment=payment).first()
    if existing is not None:
        return existing

    receipt = Receipt.objects.create(
        payment=payment,
        application=payment.application,
        issued_by=actor,
        is_available_to_customer=True,
    )

    buffer = pdf.render_receipt(receipt)
    receipt.pdf.save(f"{receipt.receipt_number}.pdf", ContentFile(buffer.read()), save=True)

    workflow.add_timeline(
        payment.application,
        action="Receipt issued",
        description=f"Receipt {receipt.receipt_number} is available in the portal.",
        actor=actor,
    )

    audit.record(
        action="create",
        module="receipts",
        actor=actor,
        record_id=receipt.pk,
        record_label=receipt.receipt_number,
        request=request,
    )

    notify_service.notify(
        payment.application.customer.user,
        category=Notification.Category.RECEIPT_AVAILABLE,
        title="Receipt available",
        message=f"Receipt {receipt.receipt_number} is ready to download.",
        application=payment.application,
        link=f"/portal/applications/{payment.application.pk}",
    )

    return receipt


@transaction.atomic
def issue_official_document(
    application,
    *,
    kind,
    actor=None,
    request=None,
    title="",
    release_to_customer=True,
    send_email=True,
):
    """Generate a verification certificate or approval letter (section 36).

    The application must actually have reached the status the document
    asserts: a certificate claiming approval for an application still under
    review would be a false record.
    """
    from applications.models import ApplicationStatus

    if kind == OfficialDocument.Kind.APPROVAL:
        allowed = {ApplicationStatus.APPROVED, ApplicationStatus.COMPLETED}
        if application.status not in allowed:
            raise PaymentError(
                "An approval document can only be issued for an approved application."
            )
    elif kind == OfficialDocument.Kind.VERIFICATION:
        if application.verified_at is None:
            raise PaymentError(
                "A verification certificate can only be issued once the "
                "application has been verified."
            )

    label = "Approval" if kind == OfficialDocument.Kind.APPROVAL else "Verification"
    document = OfficialDocument.objects.create(
        application=application,
        kind=kind,
        title=title or f"Application {label.lower()} — {application.application_number}",
        generated_by=actor,
        is_available_to_customer=release_to_customer,
    )

    buffer = pdf.render_official_document(document)
    filename = f"{application.application_number}-{kind}.pdf"
    document.pdf.save(filename, ContentFile(buffer.read()), save=True)

    workflow.add_timeline(
        application,
        action=f"{label} document issued",
        description=document.title,
        actor=actor,
        visible=release_to_customer,
    )

    audit.record(
        action="create",
        module="official_documents",
        actor=actor,
        record_id=document.pk,
        record_label=document.title,
        request=request,
    )

    if release_to_customer:
        notify_service.notify(
            application.customer.user,
            category=Notification.Category.APPLICATION_UPDATE,
            title=f"{label} document available",
            message=f"Your {label.lower()} document is ready to download.",
            application=application,
            link=f"/portal/applications/{application.pk}",
        )

        if send_email:
            _email_document(application, document, label, actor)

    return document


def _email_document(application, document, label, actor):
    """Send the customer their document as an attachment (section 32)."""
    from emails.models import EmailTemplate

    recipient = application.email or application.customer.user.email
    if not recipient:
        return None

    try:
        document.pdf.open("rb")
        content = document.pdf.read()
        document.pdf.close()
    except (FileNotFoundError, ValueError):
        # The notification and portal copy still stand; a missing file should
        # not raise out of the issuing transaction.
        return None

    attachments = [
        {
            "filename": document.pdf.name.split("/")[-1],
            "content": content,
            "mimetype": "application/pdf",
        }
    ]

    trigger = (
        EmailTemplate.Trigger.APPLICATION_APPROVED
        if document.kind == OfficialDocument.Kind.APPROVAL
        else EmailTemplate.Trigger.APPLICATION_VERIFIED
    )

    sent = email_service.send_from_template(
        trigger,
        to_email=recipient,
        application=application,
        staff=actor,
        attachments=attachments,
    )
    if sent is not None:
        return sent

    # No template configured: still deliver the document rather than leaving
    # the customer with only a portal notification.
    return email_service.send_email(
        to_email=recipient,
        subject=f"{label} document — {application.application_number}",
        body=(
            f"Dear {application.full_name},\n\n"
            f"Your {label.lower()} document for application "
            f"{application.application_number} is attached, and is also "
            f"available in your customer portal.\n\n"
            f"Regards"
        ),
        application=application,
        sent_by=actor,
        attachments=attachments,
    )
