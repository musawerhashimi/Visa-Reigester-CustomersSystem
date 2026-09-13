"""Payments, receipts, and the official documents generated from them."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from applications.models import Application, ApplicationStatus
from customers.models import CustomerProfile
from emails.models import EmailLog
from notifications.models import Notification
from visas.models import VisaType

from . import services
from .models import OfficialDocument, Payment, Receipt

User = get_user_model()


@override_settings(
    MEDIA_ROOT="/tmp/visacrm-payment-test-media",
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class PaymentTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command

        call_command("seed_demo", verbosity=0)
        cls.visa = VisaType.objects.get(slug="germany-student-visa")

        cls.admin = User.objects.create_user(
            email="admin@pay.test",
            password="StrongPass2026!",
            role=User.Role.SUPER_ADMIN,
            first_name="Amina",
            last_name="Rahimi",
        )
        cls.officer = User.objects.create_user(
            email="officer@pay.test",
            password="StrongPass2026!",
            role=User.Role.VISA_OFFICER,
        )
        cls.customer_user = User.objects.create_user(
            email="ahmad@pay.test",
            password="StrongPass2026!",
            first_name="Ahmad",
            last_name="Khan",
        )
        cls.profile = CustomerProfile.objects.create(user=cls.customer_user)

        cls.other_user = User.objects.create_user(
            email="other@pay.test", password="StrongPass2026!"
        )
        cls.other_profile = CustomerProfile.objects.create(user=cls.other_user)

    def setUp(self):
        self.application = Application.objects.create(
            customer=self.profile,
            visa_type=self.visa,
            first_name="Ahmad",
            last_name="Khan",
            email="ahmad@pay.test",
        )

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    # --- recording --------------------------------------------------------

    def test_recording_a_payment_issues_a_receipt(self):
        response = self.client_for(self.admin).post(
            "/api/payments/record/",
            {
                "application": self.application.pk,
                "amount": "500.00",
                "currency": "EUR",
                "method": "cash",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        payment = Payment.objects.get()
        self.assertEqual(payment.amount, Decimal("500.00"))
        self.assertEqual(payment.recorded_by, self.admin)

        receipt = Receipt.objects.get()
        self.assertRegex(receipt.receipt_number, r"^RCPT-\d{4}-\d{6}$")
        self.assertTrue(receipt.pdf.name.endswith(".pdf"))

    def test_receipt_pdf_is_a_real_pdf_containing_the_details(self):
        payment, receipt = services.record_payment(
            self.application, amount=Decimal("500.00"), actor=self.admin
        )

        receipt.pdf.open("rb")
        content = receipt.pdf.read()
        receipt.pdf.close()

        self.assertTrue(content.startswith(b"%PDF-"))
        self.assertGreater(len(content), 1000)

        # The reader must be able to find the numbers that matter. ReportLab
        # compresses page streams, so decompress before searching.
        text = _pdf_text(content)
        self.assertIn(receipt.receipt_number, text)
        self.assertIn(self.application.application_number, text)
        self.assertIn("Ahmad Khan", text)
        self.assertIn("500.00", text)

    def test_unpaid_payment_does_not_get_a_receipt(self):
        """A receipt for money not received would be a false record."""
        payment, receipt = services.record_payment(
            self.application,
            amount=Decimal("100.00"),
            status=Payment.Status.UNPAID,
            actor=self.admin,
        )

        self.assertIsNone(receipt)
        self.assertFalse(Receipt.objects.exists())

    def test_zero_amount_is_refused(self):
        with self.assertRaises(services.PaymentError):
            services.record_payment(
                self.application, amount=Decimal("0.00"), actor=self.admin
            )

    def test_receipt_is_issued_once(self):
        payment, first = services.record_payment(
            self.application, amount=Decimal("500.00"), actor=self.admin
        )
        second = services.issue_receipt_for(payment, actor=self.admin)

        self.assertEqual(first.pk, second.pk)
        self.assertEqual(Receipt.objects.count(), 1)

    def test_customer_is_notified_of_a_recorded_payment(self):
        services.record_payment(
            self.application, amount=Decimal("500.00"), actor=self.admin
        )

        self.assertTrue(
            Notification.objects.filter(
                recipient=self.customer_user,
                category=Notification.Category.PAYMENT,
            ).exists()
        )
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.customer_user,
                category=Notification.Category.RECEIPT_AVAILABLE,
            ).exists()
        )

    def test_officer_without_manage_permission_cannot_record(self):
        response = self.client_for(self.officer).post(
            "/api/payments/record/",
            {"application": self.application.pk, "amount": "500.00"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_customer_cannot_record_their_own_payment(self):
        response = self.client_for(self.customer_user).post(
            "/api/payments/record/",
            {"application": self.application.pk, "amount": "1.00"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    # --- access -----------------------------------------------------------

    def test_customer_sees_only_their_own_payments(self):
        services.record_payment(
            self.application, amount=Decimal("500.00"), actor=self.admin
        )
        other_application = Application.objects.create(
            customer=self.other_profile,
            visa_type=self.visa,
            first_name="Other",
            last_name="Person",
        )
        services.record_payment(
            other_application, amount=Decimal("250.00"), actor=self.admin
        )

        response = self.client_for(self.customer_user).get("/api/payments/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["amount"], "500.00")

    def test_customer_cannot_download_another_customers_receipt(self):
        _, receipt = services.record_payment(
            self.application, amount=Decimal("500.00"), actor=self.admin
        )

        response = self.client_for(self.other_user).get(
            f"/api/receipts/{receipt.pk}/download/"
        )
        self.assertEqual(response.status_code, 404)

    def test_owner_can_download_their_receipt(self):
        _, receipt = services.record_payment(
            self.application, amount=Decimal("500.00"), actor=self.admin
        )

        response = self.client_for(self.customer_user).get(
            f"/api/receipts/{receipt.pk}/download/"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")

    def test_withheld_receipt_is_hidden_from_the_customer(self):
        _, receipt = services.record_payment(
            self.application, amount=Decimal("500.00"), actor=self.admin
        )
        receipt.is_available_to_customer = False
        receipt.save(update_fields=["is_available_to_customer"])

        listing = self.client_for(self.customer_user).get("/api/receipts/")
        self.assertEqual(listing.data["count"], 0)

        download = self.client_for(self.customer_user).get(
            f"/api/receipts/{receipt.pk}/download/"
        )
        self.assertEqual(download.status_code, 404)

    def test_recorder_identity_is_hidden_from_the_customer(self):
        services.record_payment(
            self.application, amount=Decimal("500.00"), actor=self.admin
        )

        staff_view = self.client_for(self.admin).get("/api/payments/")
        customer_view = self.client_for(self.customer_user).get("/api/payments/")

        self.assertEqual(
            staff_view.data["results"][0]["recorded_by_name"], "Amina Rahimi"
        )
        self.assertIsNone(customer_view.data["results"][0]["recorded_by_name"])


@override_settings(
    MEDIA_ROOT="/tmp/visacrm-document-test-media",
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class OfficialDocumentTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command

        call_command("seed_demo", verbosity=0)
        cls.visa = VisaType.objects.get(slug="germany-student-visa")

        cls.admin = User.objects.create_user(
            email="admin@doc.test",
            password="StrongPass2026!",
            role=User.Role.SUPER_ADMIN,
            first_name="Amina",
            last_name="Rahimi",
        )
        cls.customer_user = User.objects.create_user(
            email="ahmad@doc.test",
            password="StrongPass2026!",
            first_name="Ahmad",
            last_name="Khan",
        )
        cls.profile = CustomerProfile.objects.create(user=cls.customer_user)

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def make_application(self, **overrides):
        defaults = {
            "customer": self.profile,
            "visa_type": self.visa,
            "first_name": "Ahmad",
            "last_name": "Khan",
            "email": "ahmad@doc.test",
            "passport_number": "P1234567",
        }
        defaults.update(overrides)
        return Application.objects.create(**defaults)

    def test_approval_document_requires_an_approved_application(self):
        """A certificate asserting approval must not outrun the decision."""
        application = self.make_application(status=ApplicationStatus.UNDER_REVIEW)

        with self.assertRaises(services.PaymentError):
            services.issue_official_document(
                application,
                kind=OfficialDocument.Kind.APPROVAL,
                actor=self.admin,
            )
        self.assertFalse(OfficialDocument.objects.exists())

    def test_verification_certificate_requires_verification(self):
        application = self.make_application(status=ApplicationStatus.UNDER_REVIEW)

        with self.assertRaises(services.PaymentError):
            services.issue_official_document(
                application,
                kind=OfficialDocument.Kind.VERIFICATION,
                actor=self.admin,
            )

    def test_approval_document_is_generated_and_emailed(self):
        application = self.make_application(
            status=ApplicationStatus.APPROVED, decided_at=timezone.now()
        )

        document = services.issue_official_document(
            application,
            kind=OfficialDocument.Kind.APPROVAL,
            actor=self.admin,
        )

        self.assertTrue(document.pdf.name.endswith(".pdf"))
        document.pdf.open("rb")
        content = document.pdf.read()
        document.pdf.close()

        self.assertTrue(content.startswith(b"%PDF-"))
        text = _pdf_text(content)
        self.assertIn(application.application_number, text)
        self.assertIn("Ahmad Khan", text)
        self.assertIn("APPROVED", text)

        # Emailed with the PDF attached (section 32).
        log = EmailLog.objects.filter(to_email="ahmad@doc.test").last()
        self.assertIsNotNone(log)
        # The PDF is kept on the log too, so the history shows what was sent.
        self.assertEqual(log.attachments.count(), 1)
        self.assertTrue(log.attachments.first().original_filename.endswith(".pdf"))
        from django.core import mail

        self.assertTrue(mail.outbox)
        self.assertTrue(mail.outbox[-1].attachments)
        self.assertTrue(mail.outbox[-1].attachments[0][0].endswith(".pdf"))

    def test_verification_certificate_names_the_officer(self):
        application = self.make_application(
            status=ApplicationStatus.VERIFIED, verified_at=timezone.now()
        )

        document = services.issue_official_document(
            application,
            kind=OfficialDocument.Kind.VERIFICATION,
            actor=self.admin,
            send_email=False,
        )

        document.pdf.open("rb")
        text = _pdf_text(document.pdf.read())
        document.pdf.close()

        self.assertIn("VERIFIED", text)
        self.assertIn("Amina Rahimi", text)

    def test_withheld_document_is_hidden_and_not_emailed(self):
        application = self.make_application(
            status=ApplicationStatus.APPROVED, decided_at=timezone.now()
        )

        document = services.issue_official_document(
            application,
            kind=OfficialDocument.Kind.APPROVAL,
            actor=self.admin,
            release_to_customer=False,
        )

        from django.core import mail

        self.assertEqual(len(mail.outbox), 0)
        self.assertFalse(
            Notification.objects.filter(recipient=self.customer_user).exists()
        )

        listing = self.client_for(self.customer_user).get("/api/official-documents/")
        self.assertEqual(listing.data["count"], 0)

        # Staff still see it.
        staff_listing = self.client_for(self.admin).get("/api/official-documents/")
        self.assertEqual(staff_listing.data["count"], 1)
        self.assertEqual(staff_listing.data["results"][0]["id"], document.pk)

    def test_issue_endpoint_rejects_an_unapproved_application(self):
        application = self.make_application(status=ApplicationStatus.PROCESSING)

        response = self.client_for(self.admin).post(
            "/api/official-documents/issue/",
            {"application": application.pk, "kind": "approval"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("approved", response.data["detail"].lower())

    def test_staff_attach_the_real_visa_instead_of_a_generated_letter(self):
        """The scanned visa or OIC is the document the customer needs; a
        generated letter is only the fallback."""
        from django.core.files.uploadedfile import SimpleUploadedFile

        application = self.make_application(
            status=ApplicationStatus.APPROVED, decided_at=timezone.now()
        )
        scan = SimpleUploadedFile(
            "visa-scan.jpg", b"\xff\xd8\xff\xe0 not really a jpeg", "image/jpeg"
        )

        response = self.client_for(self.admin).post(
            "/api/official-documents/issue/",
            {
                "application": application.pk,
                "kind": "approval",
                "title": "Visa sticker",
                "file": scan,
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 201, response.data)

        document = OfficialDocument.objects.get(pk=response.data["id"])
        # Stored under its own extension, not relabelled as a PDF.
        self.assertTrue(document.pdf.name.endswith(".jpg"), document.pdf.name)
        document.pdf.open("rb")
        self.assertEqual(document.pdf.read(), b"\xff\xd8\xff\xe0 not really a jpeg")
        document.pdf.close()

        # And emailed to the customer as that same file.
        log = EmailLog.objects.filter(to_email="ahmad@doc.test").last()
        self.assertIsNotNone(log)

    def test_an_oversized_attachment_is_refused(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from django.test import override_settings

        application = self.make_application(
            status=ApplicationStatus.APPROVED, decided_at=timezone.now()
        )
        oversized = SimpleUploadedFile("huge.pdf", b"x" * 2048, "application/pdf")

        # Lower the ceiling rather than allocate a real oversized file: the
        # branch under test is the comparison, not the megabytes.
        with override_settings(MAX_UPLOAD_SIZE_BYTES=1024):
            response = self.client_for(self.admin).post(
                "/api/official-documents/issue/",
                {"application": application.pk, "kind": "approval", "file": oversized},
                format="multipart",
            )

        self.assertEqual(response.status_code, 400)
        self.assertIn("file", response.data)

    def test_issuing_without_a_file_still_generates_the_letter(self):
        application = self.make_application(
            status=ApplicationStatus.APPROVED, decided_at=timezone.now()
        )

        response = self.client_for(self.admin).post(
            "/api/official-documents/issue/",
            {"application": application.pk, "kind": "approval"},
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)
        document = OfficialDocument.objects.get(pk=response.data["id"])
        self.assertTrue(document.pdf.name.endswith(".pdf"))

    def test_the_customer_is_told_the_real_filename(self):
        """An attached scan must not be saved as ".pdf" on the customer's
        machine, so the API has to name the stored file."""
        from django.core.files.uploadedfile import SimpleUploadedFile

        application = self.make_application(
            status=ApplicationStatus.APPROVED, decided_at=timezone.now()
        )
        self.client_for(self.admin).post(
            "/api/official-documents/issue/",
            {
                "application": application.pk,
                "kind": "approval",
                "file": SimpleUploadedFile("visa.jpg", b"\xff\xd8\xff", "image/jpeg"),
            },
            format="multipart",
        )

        listing = self.client_for(self.customer_user).get("/api/official-documents/")
        row = listing.data["results"][0]

        self.assertTrue(row["filename"].endswith(".jpg"), row["filename"])
        self.assertNotIn("/", row["filename"])

    def test_customer_cannot_issue_a_document(self):
        application = self.make_application(
            status=ApplicationStatus.APPROVED, decided_at=timezone.now()
        )

        response = self.client_for(self.customer_user).post(
            "/api/official-documents/issue/",
            {"application": application.pk, "kind": "approval"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)


def _pdf_text(content):
    """Extract page text from a ReportLab PDF for assertions.

    ReportLab ASCII85-encodes page streams and then Flate-compresses them, so
    both layers come off before the text-showing operators are readable.
    """
    import base64
    import re
    import zlib

    chunks = []
    for match in re.finditer(rb"stream\r?\n(.*?)endstream", content, re.S):
        raw = match.group(1).strip()

        # ASCII85 first; the terminator is stripped by a85decode's adobe mode.
        for decoded in _peel(raw):
            chunks.append(decoded)

    blob = b"\n".join(chunks).decode("latin-1")
    pieces = re.findall(r"\((?:\\.|[^()\\])*\)", blob)
    return " ".join(
        piece[1:-1].replace("\\(", "(").replace("\\)", ")") for piece in pieces
    )


def _peel(raw):
    """Yield whatever readable bytes a stream contains, trying each layer."""
    import base64
    import zlib

    candidates = [raw]
    try:
        candidates.append(base64.a85decode(raw, adobe=True))
    except Exception:
        pass

    for candidate in candidates:
        try:
            yield zlib.decompress(candidate)
            return
        except zlib.error:
            continue
    yield raw
