"""Manual email composition, templates, and correspondence history."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from applications.models import Application
from customers.models import CustomerProfile
from documents.models import Document, DocumentType
from payments import services as payment_services
from visas.models import VisaType

from .models import EmailAttachment, EmailLog, EmailTemplate

User = get_user_model()


def pdf_upload(name="letter.pdf"):
    return SimpleUploadedFile(name, b"%PDF-1.4 attachment content", "application/pdf")


@override_settings(
    MEDIA_ROOT="/tmp/visacrm-email-test-media",
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class ComposeEmailTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command

        call_command("seed_demo", verbosity=0)
        cls.visa = VisaType.objects.get(slug="germany-student-visa")

        cls.admin = User.objects.create_user(
            email="admin@mail.test",
            password="StrongPass2026!",
            role=User.Role.SUPER_ADMIN,
            first_name="Amina",
            last_name="Rahimi",
        )
        cls.officer = User.objects.create_user(
            email="officer@mail.test",
            password="StrongPass2026!",
            role=User.Role.VISA_OFFICER,
            first_name="Omar",
            last_name="Yilmaz",
        )
        cls.cms_manager = User.objects.create_user(
            email="cms@mail.test",
            password="StrongPass2026!",
            role=User.Role.CMS_MANAGER,
        )
        cls.customer_user = User.objects.create_user(
            email="ahmad@mail.test",
            password="StrongPass2026!",
            first_name="Ahmad",
            last_name="Khan",
        )
        cls.profile = CustomerProfile.objects.create(user=cls.customer_user)

    def setUp(self):
        mail.outbox = []
        self.application = Application.objects.create(
            customer=self.profile,
            visa_type=self.visa,
            first_name="Ahmad",
            last_name="Khan",
            email="ahmad@mail.test",
        )

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    # --- sending ----------------------------------------------------------

    def test_staff_can_send_a_custom_email(self):
        response = self.client_for(self.admin).post(
            "/api/emails/compose/",
            {
                "application": self.application.pk,
                "to_email": "ahmad@mail.test",
                "subject": "Your appointment is confirmed",
                "body": "Please bring your passport on Thursday at 10:00.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].subject, "Your appointment is confirmed")

        log = EmailLog.objects.get()
        self.assertFalse(log.is_automatic)
        self.assertEqual(log.sent_by, self.admin)
        self.assertEqual(log.application, self.application)
        self.assertEqual(log.status, EmailLog.Status.SENT)

    def test_manual_email_appears_in_the_application_timeline(self):
        """Section 47: correspondence belongs to the application history."""
        self.client_for(self.admin).post(
            "/api/emails/compose/",
            {
                "application": self.application.pk,
                "to_email": "ahmad@mail.test",
                "subject": "Document request follow-up",
                "body": "Just checking in on the bank statement.",
            },
            format="json",
        )

        self.assertTrue(
            self.application.timeline.filter(action="Email sent").exists()
        )

    def test_attachments_are_sent_and_recorded(self):
        response = self.client_for(self.admin).post(
            "/api/emails/compose/",
            {
                "application": self.application.pk,
                "to_email": "ahmad@mail.test",
                "subject": "Your approval letter",
                "body": "Please find your letter attached.",
                "attachments": [pdf_upload("approval-letter.pdf")],
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(mail.outbox[0].attachments)
        self.assertEqual(mail.outbox[0].attachments[0][0], "approval-letter.pdf")

        # And kept, so staff can see later what was sent.
        attachment = EmailAttachment.objects.get()
        self.assertEqual(attachment.original_filename, "approval-letter.pdf")
        self.assertGreater(attachment.size_bytes, 0)
        self.assertIn("approval-letter", attachment.file.name)

    def test_existing_receipt_can_be_attached(self):
        _, receipt = payment_services.record_payment(
            self.application, amount=Decimal("500.00"), actor=self.admin
        )
        mail.outbox = []

        response = self.client_for(self.admin).post(
            "/api/emails/compose/",
            {
                "application": self.application.pk,
                "to_email": "ahmad@mail.test",
                "subject": "Your receipt",
                "body": "Attached.",
                "attach_receipts": [receipt.pk],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(mail.outbox[-1].attachments)
        self.assertEqual(
            mail.outbox[-1].attachments[0][0], f"{receipt.receipt_number}.pdf"
        )

    def test_cannot_attach_a_record_from_another_application(self):
        """A chosen id must not pull a file out of someone else's case."""
        other_user = User.objects.create_user(
            email="other@mail.test", password="StrongPass2026!"
        )
        other_profile = CustomerProfile.objects.create(user=other_user)
        other_application = Application.objects.create(
            customer=other_profile,
            visa_type=self.visa,
            first_name="Other",
            last_name="Person",
        )
        other_document = Document.objects.create(
            application=other_application,
            document_type=DocumentType.objects.get(code="passport"),
            file=pdf_upload("their-passport.pdf"),
        )
        mail.outbox = []

        response = self.client_for(self.admin).post(
            "/api/emails/compose/",
            {
                "application": self.application.pk,
                "to_email": "ahmad@mail.test",
                "subject": "Attempted leak",
                "body": "Nothing should attach.",
                "attach_documents": [other_document.pk],
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(mail.outbox[-1].attachments, [])

    def test_cc_is_parsed_and_delivered(self):
        response = self.client_for(self.admin).post(
            "/api/emails/compose/",
            {
                "application": self.application.pk,
                "to_email": "ahmad@mail.test",
                "cc": "office@mail.test, supervisor@mail.test",
                "subject": "With copies",
                "body": "Copied to the office.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(
            mail.outbox[0].cc, ["office@mail.test", "supervisor@mail.test"]
        )

    def test_invalid_cc_is_rejected(self):
        response = self.client_for(self.admin).post(
            "/api/emails/compose/",
            {
                "to_email": "ahmad@mail.test",
                "cc": "not-an-address",
                "subject": "Bad copy",
                "body": "Should not send.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(len(mail.outbox), 0)

    def test_empty_subject_or_body_is_rejected(self):
        client = self.client_for(self.admin)

        blank_subject = client.post(
            "/api/emails/compose/",
            {"to_email": "ahmad@mail.test", "subject": "   ", "body": "Hello"},
            format="json",
        )
        blank_body = client.post(
            "/api/emails/compose/",
            {"to_email": "ahmad@mail.test", "subject": "Hello", "body": "  "},
            format="json",
        )

        self.assertEqual(blank_subject.status_code, 400)
        self.assertEqual(blank_body.status_code, 400)
        self.assertEqual(len(mail.outbox), 0)

    def test_unsupported_attachment_type_is_rejected(self):
        response = self.client_for(self.admin).post(
            "/api/emails/compose/",
            {
                "to_email": "ahmad@mail.test",
                "subject": "Executable",
                "body": "Should not send.",
                "attachments": [
                    SimpleUploadedFile("virus.exe", b"MZ", "application/x-msdownload")
                ],
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(len(mail.outbox), 0)

    # --- permissions ------------------------------------------------------

    def test_customer_cannot_reach_the_composer(self):
        response = self.client_for(self.customer_user).post(
            "/api/emails/compose/",
            {"to_email": "someone@mail.test", "subject": "Hi", "body": "Hello"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_cms_manager_cannot_send_customer_email(self):
        """Section 42: the CMS role has no access to customer correspondence."""
        response = self.client_for(self.cms_manager).post(
            "/api/emails/compose/",
            {"to_email": "ahmad@mail.test", "subject": "Hi", "body": "Hello"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_customer_cannot_read_the_email_history(self):
        EmailLog.objects.create(
            to_email="ahmad@mail.test",
            subject="Internal",
            body="Body",
            application=self.application,
        )

        response = self.client_for(self.customer_user).get("/api/emails/")
        self.assertEqual(response.status_code, 403)

    def test_officer_sees_correspondence_on_their_own_work(self):
        mine = Application.objects.create(
            customer=self.profile,
            visa_type=self.visa,
            first_name="Mine",
            last_name="Case",
            assigned_to=self.officer,
        )
        other_user = User.objects.create_user(
            email="stranger@mail.test", password="StrongPass2026!"
        )
        other_profile = CustomerProfile.objects.create(user=other_user)
        theirs = Application.objects.create(
            customer=other_profile,
            visa_type=self.visa,
            first_name="Not",
            last_name="Mine",
            assigned_to=self.admin,
        )

        EmailLog.objects.create(
            to_email="a@mail.test", subject="Mine", body="b", application=mine
        )
        EmailLog.objects.create(
            to_email="b@mail.test", subject="Theirs", body="b", application=theirs
        )

        response = self.client_for(self.officer).get("/api/emails/")

        subjects = {row["subject"] for row in response.data["results"]}
        self.assertIn("Mine", subjects)
        self.assertNotIn("Theirs", subjects)


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class EmailTemplateTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command

        call_command("seed_demo", verbosity=0)
        cls.visa = VisaType.objects.get(slug="germany-student-visa")

        cls.admin = User.objects.create_user(
            email="admin@tpl.test",
            password="StrongPass2026!",
            role=User.Role.SUPER_ADMIN,
            first_name="Amina",
            last_name="Rahimi",
        )
        cls.officer = User.objects.create_user(
            email="officer@tpl.test",
            password="StrongPass2026!",
            role=User.Role.VISA_OFFICER,
        )
        customer_user = User.objects.create_user(
            email="ahmad@tpl.test",
            password="StrongPass2026!",
            first_name="Ahmad",
            last_name="Khan",
        )
        cls.profile = CustomerProfile.objects.create(user=customer_user)

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def test_preview_resolves_placeholders_against_an_application(self):
        application = Application.objects.create(
            customer=self.profile,
            visa_type=self.visa,
            first_name="Ahmad",
            last_name="Khan",
            email="ahmad@tpl.test",
        )
        template = EmailTemplate.objects.get(code="application-received")

        response = self.client_for(self.admin).post(
            "/api/email-templates/preview/",
            {"template": template.pk, "application": application.pk},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn(application.application_number, response.data["subject"])
        self.assertIn("Ahmad Khan", response.data["body"])
        self.assertNotIn("{{", response.data["body"])
        self.assertEqual(response.data["to_email"], "ahmad@tpl.test")

    def test_preview_leaves_unknown_placeholders_visible(self):
        """An unresolved placeholder is a bug the sender should see."""
        template = EmailTemplate.objects.create(
            code="odd-one",
            name="Odd",
            subject="Hello {{customer_name}}",
            body="Reference {{not_a_real_variable}}",
        )

        response = self.client_for(self.admin).post(
            "/api/email-templates/preview/",
            {"template": template.pk},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertIn("{{not_a_real_variable}}", response.data["body"])

    def test_officer_cannot_edit_templates(self):
        template = EmailTemplate.objects.first()

        response = self.client_for(self.officer).patch(
            f"/api/email-templates/{template.pk}/",
            {"subject": "Rewritten"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_admin_can_create_a_template(self):
        response = self.client_for(self.admin).post(
            "/api/email-templates/",
            {
                "code": "appointment-reminder",
                "name": "Appointment reminder",
                "subject": "Your appointment for {{application_id}}",
                "body": "Dear {{customer_name}}, please attend on time.",
                "trigger": "manual",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertTrue(
            EmailTemplate.objects.filter(code="appointment-reminder").exists()
        )

    def test_template_lists_its_available_variables(self):
        template = EmailTemplate.objects.first()

        response = self.client_for(self.admin).get(
            f"/api/email-templates/{template.pk}/"
        )

        self.assertIn("customer_name", response.data["available_variables"])
        self.assertIn("application_id", response.data["available_variables"])


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    DEFAULT_FROM_EMAIL="noreply@server.test",
)
class SendingAddressTests(TestCase):
    """The office sets the From address in the MIS; the environment is the
    fallback, so an unconfigured install keeps working."""

    def setUp(self):
        from cms.models import CompanyInfo

        self.info = CompanyInfo.load()

    def _send(self):
        from emails import services

        return services.send_email(
            to_email="customer@example.com", subject="Hi", body="Body"
        )

    def test_a_blank_setting_falls_back_to_the_environment(self):
        self.info.sending_email = ""
        self.info.save()

        self._send()

        self.assertEqual(mail.outbox[-1].from_email, "noreply@server.test")

    def test_a_configured_address_is_used_as_the_sender(self):
        self.info.sending_email = "office@visacare.test"
        self.info.save()

        log = self._send()

        self.assertEqual(log.status, "sent")
        self.assertEqual(mail.outbox[-1].from_email, "office@visacare.test")
