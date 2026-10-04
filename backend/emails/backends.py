"""Delivery through Resend's HTTPS API instead of SMTP.

Some hosts block outbound SMTP (Railway's Hobby plan closes ports 25, 465 and
587), so a mail server that works from a laptop times out in production. An
HTTPS request goes out on 443 like any other API call.

    RESEND_API_KEY=re_...

The From address must be on a domain verified in Resend, or it is rejected.
"""

import base64
import json
import urllib.error
import urllib.request
from email.mime.base import MIMEBase

from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend

RESEND_URL = "https://api.resend.com/emails"


class ResendError(Exception):
    pass


class ResendEmailBackend(BaseEmailBackend):
    def __init__(self, api_key=None, timeout=None, fail_silently=False, **kwargs):
        super().__init__(fail_silently=fail_silently)
        self.api_key = api_key or settings.RESEND_API_KEY
        self.timeout = timeout or settings.EMAIL_TIMEOUT

    def send_messages(self, email_messages):
        sent = 0
        for message in email_messages:
            try:
                self._post(payload_for(message))
            except Exception:
                if not self.fail_silently:
                    raise
            else:
                sent += 1
        return sent

    def _post(self, payload):
        if not self.api_key:
            raise ResendError("RESEND_API_KEY is not set.")

        request = urllib.request.Request(
            RESEND_URL,
            data=json.dumps(payload).encode(),
            method="POST",
            headers={
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
                # Resend's edge rejects urllib's default agent with a bare 403.
                "User-Agent": "visacrm/1.0",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return json.loads(response.read() or b"{}")
        except urllib.error.HTTPError as error:
            raise ResendError(f"Resend rejected the email: {_reason(error)}") from error
        except urllib.error.URLError as error:
            raise ResendError(f"Could not reach Resend: {error.reason}") from error


def payload_for(message):
    payload = {
        "from": message.from_email,
        "to": list(message.to),
        "subject": message.subject,
    }
    if message.cc:
        payload["cc"] = list(message.cc)
    if message.bcc:
        payload["bcc"] = list(message.bcc)
    if message.reply_to:
        payload["reply_to"] = list(message.reply_to)
    if message.extra_headers:
        payload["headers"] = {k: str(v) for k, v in message.extra_headers.items()}

    if message.content_subtype == "html":
        payload["html"] = message.body
    else:
        payload["text"] = message.body
    for content, mimetype in getattr(message, "alternatives", []) or []:
        if mimetype == "text/html":
            payload["html"] = content

    attachments = [_attachment(item) for item in message.attachments]
    if attachments:
        payload["attachments"] = attachments
    return payload


def _attachment(item):
    if isinstance(item, MIMEBase):
        filename = item.get_filename() or "attachment"
        content = item.get_payload(decode=True) or b""
    else:
        filename, content, _mimetype = item
        if isinstance(content, str):
            content = content.encode()
    return {"filename": filename, "content": base64.b64encode(content).decode()}


def _reason(error):
    body = error.read().decode(errors="replace")
    try:
        return json.loads(body).get("message") or body
    except ValueError:
        return body or f"HTTP {error.code}"
