"""Symmetric encryption for the few secrets that must live in the database.

The SMTP password is set through the MIS, so it cannot stay in the environment
like the rest of the mail configuration. Encrypting it means a leaked database
dump or backup does not hand over a working mail account: the key lives in
DJANGO_SECRET_KEY, which stays in the environment and is not part of a dump.

That also means rotating DJANGO_SECRET_KEY makes an existing stored password
unreadable. `decrypt` returns "" rather than raising, so the office is asked to
re-enter it instead of every outgoing email failing.
"""

import base64
import hashlib
import logging

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings

logger = logging.getLogger(__name__)


def _cipher():
    # Fernet wants 32 url-safe base64 bytes; the secret key is arbitrary text.
    digest = hashlib.sha256(settings.SECRET_KEY.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt(value: str) -> str:
    """Encrypt a secret for storage. Empty input stays empty."""
    if not value:
        return ""
    return _cipher().encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    """Decrypt a stored secret, or "" if it cannot be read."""
    if not value:
        return ""
    try:
        return _cipher().decrypt(value.encode()).decode()
    except (InvalidToken, ValueError):
        # Almost always a rotated SECRET_KEY. Log it once; the caller falls
        # back to the environment.
        logger.warning(
            "Stored SMTP password could not be decrypted; it must be re-entered."
        )
        return ""
