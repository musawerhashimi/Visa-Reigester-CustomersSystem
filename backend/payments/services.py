"""Recording payments and issuing receipts and official documents.

No money moves through this system: a customer pays the office directly and
a staff member records it here, so the MIS keeps the financial history.
"""

import mimetypes
import os

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
    kind=Payment.Kind.OTHER,
    card_number="",
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
        kind=kind,
        card_number=card_number,
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
def issue_receipt_for(payment, *, actor=None, request=None, send_email=True):
    """Generate the PDF for a payment, once.

    Produces a bill while the payment is unpaid and a receipt once it is
    settled, so the same call serves both ends of the exchange. The document
    reaches the customer three ways — portal, notification and email — because
    a bill nobody sees is a bill nobody pays.
    """
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

    is_bill = receipt.is_bill
    label = "Bill" if is_bill else "Receipt"
    fee = payment.get_kind_display()

    workflow.add_timeline(
        payment.application,
        action=f"{label} issued",
        description=f"{fee}: {label.lower()} {receipt.receipt_number} "
        f"for {payment.amount} {payment.currency}.",
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
        title=f"{fee} {label.lower()} available",
        message=(
            f"{payment.amount} {payment.currency} is due — {receipt.receipt_number}."
            if is_bill
            else f"{label} {receipt.receipt_number} is ready to download."
        ),
        application=payment.application,
        link=f"/portal/applications/{payment.application.pk}",
        play_sound=is_bill,
    )

    if send_email:
        _email_receipt(receipt, actor=actor)

    return receipt


def _email_receipt(receipt, *, actor=None):
    """Send the bill or receipt to the customer as a PDF attachment."""
    application = receipt.application
    recipient = application.email or application.customer.user.email
    if not recipient:
        return None

    try:
        receipt.pdf.open("rb")
        content = receipt.pdf.read()
        receipt.pdf.close()
    except (FileNotFoundError, ValueError):
        # The portal copy and notification still stand; a missing file must
        # not raise out of the issuing transaction.
        return None

    payment = receipt.payment
    fee = payment.get_kind_display()
    label = "Bill" if receipt.is_bill else "Receipt"

    body = [
        f"Dear {application.full_name},",
        "",
        (
            f"Please find attached the {fee.lower()} bill for your application "
            f"{application.application_number}."
            if receipt.is_bill
            else f"Please find attached your {fee.lower()} receipt for "
            f"application {application.application_number}."
        ),
        "",
        f"{label} number: {receipt.receipt_number}",
        f"Amount: {payment.amount} {payment.currency}",
    ]
    if receipt.is_bill and payment.card_number:
        body += [
            f"Please pay into: {payment.card_number}",
            "",
            "Once you have paid, upload your payment slip here so we can "
            "confirm it:",
            email_service.site_url(f"/portal/applications/{application.pk}"),
        ]
    else:
        body += [
            "",
            "You can see this and your other documents here:",
            email_service.site_url(f"/portal/applications/{application.pk}"),
        ]

    return email_service.send_email(
        to_email=recipient,
        subject=f"{fee} {label.lower()} – {receipt.receipt_number}",
        body="\n".join(body),
        application=application,
        attachments=[
            {
                "filename": receipt.pdf.name.split("/")[-1],
                "content": content,
                "mimetype": "application/pdf",
            }
        ],
    )


@transaction.atomic
def bill_fee(
    application,
    *,
    kind,
    amount,
    currency="EUR",
    card_number="",
    note="",
    actor=None,
    request=None,
):
    """Bill a customer for one of the two fees and send them the paperwork.

    Each fee is billed once per application: a second registration bill would
    leave the customer holding two documents for the same money.
    """
    if amount is None or amount <= 0:
        raise PaymentError("The amount must be greater than zero.")

    if Payment.objects.filter(application=application, kind=kind).exists():
        label = dict(Payment.Kind.choices).get(kind, kind)
        raise PaymentError(f"The {label.lower()} has already been billed.")

    payment = Payment.objects.create(
        application=application,
        customer=application.customer,
        amount=amount,
        currency=currency,
        method=Payment.Method.BANK_TRANSFER,
        # A bill is a request for money, so it starts unpaid and is settled
        # once the customer's proof has been checked.
        status=Payment.Status.UNPAID,
        kind=kind,
        card_number=card_number,
        note=note,
        recorded_by=actor,
    )

    audit.record(
        action="create",
        module="payments",
        actor=actor,
        record_id=payment.pk,
        record_label=f"{amount} {currency}",
        description=f"{payment.get_kind_display()} billed on "
        f"{application.application_number}.",
        request=request,
    )

    receipt = issue_receipt_for(payment, actor=actor, request=request)
    return payment, receipt


@transaction.atomic
def settle_payment(payment, *, actor=None, request=None):
    """Mark a billed payment as paid, once its proof has been checked."""
    if payment.status == Payment.Status.PAID:
        raise PaymentError("This payment is already settled.")

    payment.status = Payment.Status.PAID
    payment.paid_at = timezone.now()
    payment.save(update_fields=["status", "paid_at", "updated_at"])

    workflow.add_timeline(
        payment.application,
        action="Payment confirmed",
        description=f"{payment.get_kind_display()}: {payment.amount} "
        f"{payment.currency} received.",
        actor=actor,
    )

    audit.record(
        action="update",
        module="payments",
        actor=actor,
        record_id=payment.pk,
        record_label=f"{payment.amount} {payment.currency}",
        field_name="status",
        old_value=Payment.Status.UNPAID,
        new_value=Payment.Status.PAID,
        request=request,
    )

    notify_service.notify(
        payment.application.customer.user,
        category=Notification.Category.PAYMENT,
        title="Payment confirmed",
        message=f"We have confirmed your {payment.get_kind_display().lower()} "
        f"of {payment.amount} {payment.currency}.",
        application=payment.application,
        link=f"/portal/applications/{payment.application.pk}",
    )

    # The document was written as a bill while the money was owed. Now that it
    # has arrived the customer needs a receipt, not a demand for payment, so
    # the PDF is rebuilt and sent as the confirmation.
    receipt = Receipt.objects.filter(payment=payment).first()
    if receipt is not None:
        _regenerate_receipt_pdf(receipt)
        _email_payment_confirmed(receipt)

    return payment


def _regenerate_receipt_pdf(receipt):
    """Rewrite a receipt's PDF against the payment's current state."""
    # The related payment is cached from when it was unpaid, so the template
    # would otherwise render the old wording.
    receipt.refresh_from_db()
    buffer = pdf.render_receipt(receipt)

    old_name = receipt.pdf.name
    receipt.pdf.save(
        f"{receipt.receipt_number}.pdf", ContentFile(buffer.read()), save=True
    )
    # Storage suffixes a new name rather than overwriting, so the superseded
    # bill would linger on disk unreferenced.
    if old_name and old_name != receipt.pdf.name:
        receipt.pdf.storage.delete(old_name)
    return receipt


def _email_payment_confirmed(receipt):
    """Tell the customer their money arrived, with the receipt attached."""
    application = receipt.application
    recipient = application.email or application.customer.user.email
    if not recipient:
        return None

    try:
        receipt.pdf.open("rb")
        content = receipt.pdf.read()
        receipt.pdf.close()
    except (FileNotFoundError, ValueError):
        # The portal copy and notification still stand; a missing file must
        # not raise out of the confirming transaction.
        return None

    payment = receipt.payment
    fee = payment.get_kind_display()

    body = "\n".join(
        [
            f"Dear {application.full_name},",
            "",
            f"We have received your {fee.lower()} of "
            f"{payment.amount} {payment.currency}. Thank you.",
            "",
            f"Your receipt {receipt.receipt_number} is attached, and is also "
            "available in your account:",
            email_service.site_url(f"/portal/applications/{application.pk}"),
            "",
            f"Application: {application.application_number}",
        ]
    )

    return email_service.send_email(
        to_email=recipient,
        subject=f"Payment confirmed – {receipt.receipt_number}",
        body=body,
        application=application,
        attachments=[
            {
                "filename": receipt.pdf.name.split("/")[-1],
                "content": content,
                "mimetype": "application/pdf",
            }
        ],
    )


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
    uploaded_file=None,
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

    if uploaded_file is not None:
        # The real visa, OIC or authority letter. Keep its own extension so
        # the customer receives a scan as a scan, not mislabelled as a PDF.
        extension = os.path.splitext(uploaded_file.name)[1].lower() or ".pdf"
        filename = f"{application.application_number}-{kind}{extension}"
        document.pdf.save(filename, uploaded_file, save=True)
    else:
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

    # An uploaded scan may be a JPEG or PNG, so read the type off the name
    # rather than asserting PDF for everything.
    filename = document.pdf.name.split("/")[-1]
    mimetype = mimetypes.guess_type(filename)[0] or "application/octet-stream"

    attachments = [
        {
            "filename": filename,
            "content": content,
            "mimetype": mimetype,
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
