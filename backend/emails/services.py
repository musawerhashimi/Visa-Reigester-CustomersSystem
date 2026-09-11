"""Rendering and sending email, with every message logged.

Templates use {{variable}} placeholders. Substitution is a plain string
replace over a known set of keys rather than Django's template engine: staff
author these bodies in the MIS, and a template language would let a typo raise
at send time or expose object internals through attribute access.
"""

import logging
import re

from django.conf import settings
from django.core.mail import EmailMessage
from django.utils import timezone

from .models import EmailLog, EmailTemplate

logger = logging.getLogger(__name__)

PLACEHOLDER = re.compile(r"\{\{\s*(\w+)\s*\}\}")


def build_context(*, application=None, customer=None, staff=None, extra=None):
    company = getattr(settings, "COMPANY_NAME", "VisaCare")
    context = {"company_name": company}

    if application is not None:
        context.update(
            {
                "customer_name": application.full_name,
                "application_id": application.application_number,
                "visa_type": _visa_name(application),
                "country": _country_name(application),
                "status": application.get_status_display(),
                "application_date": (
                    application.submitted_at or application.created_at
                ).strftime("%d %B %Y"),
            }
        )
    elif customer is not None:
        context["customer_name"] = customer.user.get_full_name() or customer.user.email

    if staff is not None:
        context["staff_name"] = staff.get_full_name() or staff.email

    if extra:
        context.update(extra)
    return context


def _visa_name(application):
    from core.i18n import translate

    return translate(application.visa_type.name)


def _country_name(application):
    from core.i18n import translate

    return translate(application.visa_type.country.name)


def render(text, context):
    """Replace known placeholders; leave unknown ones visible.

    An unresolved {{placeholder}} in a sent email is a bug the staff member
    should see, not something to silently blank out.
    """
    return PLACEHOLDER.sub(
        lambda match: str(context.get(match.group(1), match.group(0))), text or ""
    )


def send_email(
    *,
    to_email,
    subject,
    body,
    application=None,
    customer=None,
    template=None,
    sent_by=None,
    is_automatic=True,
    attachments=None,
    cc=None,
):
    """Send and log one email. Returns the EmailLog either way.

    A delivery failure is recorded on the log and swallowed: the status change
    that triggered the email has already happened and must not be undone by an
    unreachable SMTP server.
    """
    log = EmailLog.objects.create(
        to_email=to_email,
        cc=",".join(cc) if cc else "",
        subject=subject,
        body=body,
        template=template,
        application=application,
        customer=customer or (application.customer if application else None),
        sent_by=sent_by,
        is_automatic=is_automatic,
        status=EmailLog.Status.QUEUED,
    )

    try:
        message = EmailMessage(
            subject=subject,
            body=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[to_email],
            cc=cc or None,
        )
        for attachment in attachments or []:
            message.attach(
                attachment["filename"], attachment["content"], attachment.get("mimetype")
            )
        message.send(fail_silently=False)
    except Exception as error:
        log.status = EmailLog.Status.FAILED
        log.error_message = str(error)
        log.save(update_fields=["status", "error_message", "updated_at"])
        logger.exception("Failed to send email to %s", to_email)
        return log

    log.status = EmailLog.Status.SENT
    log.sent_at = timezone.now()
    log.save(update_fields=["status", "sent_at", "updated_at"])

    # Section 32: the email and what was attached both belong to the
    # application history, so staff can see later what a customer was sent.
    _store_attachments(log, attachments)
    return log


def _store_attachments(log, attachments):
    from django.core.files.base import ContentFile

    from .models import EmailAttachment

    for attachment in attachments or []:
        content = attachment.get("content")
        if content is None:
            continue
        record = EmailAttachment(
            email=log,
            original_filename=attachment["filename"][:255],
            size_bytes=len(content),
        )
        record.file.save(attachment["filename"], ContentFile(content), save=False)
        record.save()


def send_from_template(
    trigger,
    *,
    to_email,
    application=None,
    customer=None,
    staff=None,
    extra_context=None,
    attachments=None,
):
    """Send the active template for an event, if the company configured one.

    Returns None when no template exists, so a company that has not written
    (say) a rejection email simply sends nothing instead of erroring.
    """
    template = EmailTemplate.objects.filter(trigger=trigger, is_active=True).first()
    if template is None:
        logger.info("No active email template for trigger '%s'", trigger)
        return None

    context = build_context(
        application=application, customer=customer, staff=staff, extra=extra_context
    )
    return send_email(
        to_email=to_email,
        subject=render(template.subject, context),
        body=render(template.body, context),
        application=application,
        customer=customer,
        template=template,
        is_automatic=True,
        attachments=attachments,
    )
