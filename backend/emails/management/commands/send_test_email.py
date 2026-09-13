"""Send one real email, to prove the SMTP settings work.

Delivery problems are otherwise hard to tell apart from application bugs: the
console backend reports every message as "sent" without a mail server being
involved at all. This says plainly which backend is in use before it tries.

    python manage.py send_test_email you@example.com
"""

from django.conf import settings
from django.core.mail import EmailMessage
from django.core.management.base import BaseCommand, CommandError

from emails.services import sender_address


class Command(BaseCommand):
    help = "Send a test email to the given address."

    def add_arguments(self, parser):
        parser.add_argument("recipient")

    def handle(self, *args, **options):
        recipient = options["recipient"]
        backend = settings.EMAIL_BACKEND

        self.stdout.write(f"Backend: {backend}")
        self.stdout.write(f"Host:    {settings.EMAIL_HOST or '(unset)'}")
        self.stdout.write(f"User:    {settings.EMAIL_HOST_USER or '(unset)'}")
        self.stdout.write(f"From:    {sender_address()}")
        self.stdout.write(f"To:      {recipient}")

        if "console" in backend:
            raise CommandError(
                "EMAIL_BACKEND is the console backend, which only prints to "
                "the terminal. Nothing will arrive in an inbox. Set the SMTP "
                "settings in .env and restart before testing delivery."
            )

        message = EmailMessage(
            subject="VisaCare test email",
            body="If you are reading this, sending works.",
            from_email=sender_address(),
            to=[recipient],
        )
        message.send(fail_silently=False)

        self.stdout.write(self.style.SUCCESS("Sent. Check the inbox and spam."))
