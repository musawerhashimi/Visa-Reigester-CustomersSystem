"""Rendering and sending email, with every message logged.

Templates use {{variable}} placeholders. Substitution is a plain string
replace over a known set of keys rather than Django's template engine: staff
author these bodies in the MIS, and a template language would let a typo raise
at send time or expose object internals through attribute access.
"""

import logging
import re
import threading

from django.conf import settings
from django.core.mail import EmailMessage
from django.db import connection, transaction
from django.utils import timezone

from .models import EmailLog, EmailTemplate

logger = logging.getLogger(__name__)

PLACEHOLDER = re.compile(r"\{\{\s*(\w+)\s*\}\}")


def site_url(path=""):
    """An absolute link into the customer site.

    Email is read outside the app, so a relative path is useless there: every
    link a customer is given has to carry the host.
    """
    # Normalised here rather than only at import: the setting is typed by
    # hand, and a trailing slash would otherwise produce "host//portal".
    base = (getattr(settings, "SITE_URL", "") or "").rstrip("/")
    if not path:
        return base
    return f"{base}/{path.lstrip('/')}"


def portal_links(application=None):
    """The links worth offering a customer, ready for templates and bodies."""
    links = {
        "site_url": site_url(),
        "portal_url": site_url("/portal"),
        "login_url": site_url("/login"),
        "visas_url": site_url("/visas"),
        "contact_url": site_url("/contact"),
    }
    if application is not None:
        links["application_url"] = site_url(f"/portal/applications/{application.pk}")
    return links


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

    # Available to every template, so staff can put a link in any of them.
    context.update(portal_links(application))

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


def _company():
    """The settings row, or None before the table exists or is populated."""
    from cms.models import CompanyInfo

    try:
        return CompanyInfo.objects.first()
    except Exception:  # pragma: no cover - table missing during early migrate
        return None


def sender_address(branch=None):
    """The From address for outgoing mail.

    A branch with its own address sends as itself, so a customer replying
    reaches the office handling their application rather than head office.
    Anything unset falls back to the company address, then the environment.
    """
    if branch is not None and branch.sending_email:
        return branch.sending_email

    info = _company()
    return (info.sending_email if info else "") or settings.DEFAULT_FROM_EMAIL


def mail_connection(branch=None):
    """A connection built from the mail server saved in the MIS.

    A branch running its own mailbox sends through it; otherwise the company
    server is used. Returns None when neither has SMTP enabled, which leaves
    Django to use EMAIL_BACKEND as configured in the environment — so an
    install that was set up the old way is untouched.

    RESEND_API_KEY overrides all of it: where SMTP is blocked, no saved server
    can be reached, so every office sends through Resend.
    """
    if settings.RESEND_API_KEY:
        from django.core.mail import get_connection

        return get_connection(backend="emails.backends.ResendEmailBackend")

    if branch is not None and branch.has_own_mail_server:
        return _connection_for(branch)

    info = _company()
    if not info or not info.smtp_enabled or not info.smtp_host:
        return None
    return _connection_for(info)


def _connection_for(config):
    """Build an SMTP connection from anything carrying the smtp_* fields."""
    from django.core.mail import get_connection

    return get_connection(
        backend="django.core.mail.backends.smtp.EmailBackend",
        host=config.smtp_host,
        port=config.smtp_port or 587,
        username=config.smtp_username,
        password=config.get_smtp_password(),
        use_tls=config.smtp_use_tls,
        # Django rejects having both on, and the pairing is conventional:
        # 587 with STARTTLS, 465 with implicit SSL.
        use_ssl=not config.smtp_use_tls and (config.smtp_port == 465),
        timeout=settings.EMAIL_TIMEOUT,
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
    branch=None,
):
    """Send and log one email. Returns the EmailLog either way.

    A delivery failure is recorded on the log and swallowed: the status change
    that triggered the email has already happened and must not be undone by an
    unreachable SMTP server. Automatic emails are delivered in the background
    (see EMAIL_SEND_IN_BACKGROUND), so their log is returned still queued.
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

    sender_branch = branch or (application.branch if application is not None else None)
    if is_automatic and settings.EMAIL_SEND_IN_BACKGROUND:
        # Automatic mail rides along with some other action (an upload, a
        # status change). That action should not wait on a mail server, so
        # delivery happens after the transaction commits, off the request.
        transaction.on_commit(
            lambda: threading.Thread(
                target=_deliver_in_background,
                args=(log.pk, sender_branch, attachments),
                daemon=True,
            ).start()
        )
        return log

    # Staff composing by hand wait for the result, so they learn at once if
    # the message did not go out. EMAIL_TIMEOUT bounds how long that is.
    _deliver(log, sender_branch, attachments)
    return log


def _deliver_in_background(log_pk, sender_branch, attachments):
    try:
        log = EmailLog.objects.get(pk=log_pk)
        _deliver(log, sender_branch, attachments)
    except Exception:
        logger.exception("Background delivery of email %s failed", log_pk)
    finally:
        # This thread opened its own database connection; don't leak it.
        connection.close()


def _deliver(log, sender_branch, attachments):
    """Hand one logged email to the mail server and record the outcome."""
    try:
        # Mail about an application goes out as the branch handling it.
        # `branch` covers the rest — a password reset, say, which belongs to a
        # customer rather than to any one application.
        message = EmailMessage(
            subject=log.subject,
            body=log.body,
            from_email=sender_address(sender_branch),
            to=[log.to_email],
            cc=log.cc.split(",") if log.cc else None,
            connection=mail_connection(sender_branch),
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
        logger.exception("Failed to send email to %s", log.to_email)
        return

    log.status = EmailLog.Status.SENT
    log.sent_at = timezone.now()
    log.save(update_fields=["status", "sent_at", "updated_at"])

    # Section 32: the email and what was attached both belong to the
    # application history, so staff can see later what a customer was sent.
    _store_attachments(log, attachments)


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
