"""Resetting a forgotten password by emailing a temporary one.

The customer asks from the sign-in page, the system issues a new password and
sends it; they sign in with it straight away and change it in their profile.

Mail goes out through whichever branch the customer last applied to, so the
address they see — and reply to — is the office that knows them. Nothing here
needs configuring beyond the mail server already set in the MIS.
"""

import logging
import secrets

from django.utils import timezone

from audit import services as audit
from emails import services as email_service

logger = logging.getLogger(__name__)

#: Long enough to resist guessing, short enough to read off a phone screen.
#: Ambiguous characters (0/O, 1/l/I) are left out so it can be dictated.
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
_LENGTH = 14


def generate_password():
    """A readable temporary password."""
    return "".join(secrets.choice(_ALPHABET) for _ in range(_LENGTH))


def _branch_for(user):
    """The office this customer deals with, or None.

    Their most recent application decides it: that is the branch holding their
    paperwork, so it is the address they will recognise. Staff, and customers
    who have never applied, fall through to the company sender.
    """
    application = (
        user.customer_profile.applications.alive()
        .select_related("branch")
        .order_by("-created_at")
        .first()
        if hasattr(user, "customer_profile")
        else None
    )
    return application.branch if application else None


def reset_password(user, *, request=None):
    """Issue a new password for `user` and email it to them.

    Returns the EmailLog, or None when the mail could not be built. The
    password is changed either way: telling the caller it failed would let
    someone probe which addresses exist.
    """
    password = generate_password()
    user.set_password(password)
    user.save(update_fields=["password", "updated_at"])

    audit.record(
        action="update",
        module="accounts",
        actor=None,
        record_id=user.pk,
        record_label=user.email,
        field_name="password",
        description="Password reset requested by the account holder.",
        request=request,
    )

    return _send(user, password)


def _send(user, password):
    branch = _branch_for(user)
    sign_in = email_service.site_url("/login")
    name = user.get_full_name() or user.email

    body = "\n".join(
        [
            f"Dear {name},",
            "",
            "You asked us to reset the password for your account.",
            "",
            f"Email: {user.email}",
            f"Temporary password: {password}",
            "",
            f"Sign in here: {sign_in}",
            "",
            (
                "Please change this password once you are signed in, under "
                "Profile. If you did not ask for this, contact our office — "
                "your account is safe, but someone else has your email address."
            ),
        ]
    )

    return email_service.send_email(
        to_email=user.email,
        subject="Your new password",
        body=body,
        # Carries the branch so the mail is sent from that office's address
        # and lands in its correspondence history.
        branch=branch,
    )
