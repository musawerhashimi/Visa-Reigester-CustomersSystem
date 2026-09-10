"""End-to-end coverage of the submission → verification → decision cycle."""

import io

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from customers.models import CustomerProfile
from documents.models import Document, DocumentType
from emails.models import EmailLog
from notifications.models import Notification
from visas.models import VisaType

from .models import Application, ApplicationStatus
from .services import workflow

User = get_user_model()


def pdf_upload(name="passport.pdf"):
    """A small file that passes the extension and size checks."""
    return SimpleUploadedFile(name, b"%PDF-1.4 fake test content", "application/pdf")


@override_settings(
    MEDIA_ROOT="/tmp/visacrm-test-media",
    COMPANY_NOTIFICATION_EMAIL="office@visacare.test",
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class VisaApplicationFlowTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command

        call_command("seed_demo", verbosity=0)

        cls.visa = VisaType.objects.get(slug="germany-student-visa")
        cls.customer_user = User.objects.create_user(
            email="ahmad@test.local",
            password="StrongPass2026!",
            first_name="Ahmad",
            last_name="Khan",
        )
        cls.profile = CustomerProfile.objects.create(user=cls.customer_user)

        cls.officer = User.objects.create_user(
            email="officer@test.local",
            password="StrongPass2026!",
            role=User.Role.VISA_OFFICER,
            first_name="Omar",
            last_name="Yilmaz",
        )
        cls.other_customer = User.objects.create_user(
            email="other@test.local", password="StrongPass2026!"
        )
        CustomerProfile.objects.create(user=cls.other_customer)

    def setUp(self):
        self.client = APIClient()
        mail.outbox = []

    def auth(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def make_application(self, **overrides):
        defaults = {
            "customer": self.profile,
            "visa_type": self.visa,
            "first_name": "Ahmad",
            "last_name": "Khan",
            "email": "ahmad@test.local",
            "phone": "+93700000000",
        }
        defaults.update(overrides)
        return Application.objects.create(**defaults)

    def upload_mandatory_documents(self, application):
        mandatory = self.visa.required_documents.filter(is_mandatory=True)
        for entry in mandatory:
            Document.objects.create(
                application=application,
                document_type=entry.document_type,
                file=pdf_upload(f"{entry.document_type.code}.pdf"),
                status=Document.Status.PENDING,
                is_current=True,
            )

    # --- numbering -------------------------------------------------------

    def test_application_number_is_sequential_and_prefixed(self):
        first = self.make_application()
        second = self.make_application()

        self.assertRegex(first.application_number, r"^VISA-\d{4}-\d{6}$")
        self.assertNotEqual(first.application_number, second.application_number)

        first_seq = int(first.application_number.split("-")[-1])
        second_seq = int(second.application_number.split("-")[-1])
        self.assertEqual(second_seq, first_seq + 1)

    # --- submission (rule 1) --------------------------------------------

    def test_submit_requires_mandatory_documents(self):
        application = self.make_application()
        client = self.auth(self.customer_user)

        response = client.post(f"/api/applications/{application.pk}/submit/")

        self.assertEqual(response.status_code, 400)
        self.assertIn("required documents", response.data["detail"].lower())
        application.refresh_from_db()
        self.assertEqual(application.status, ApplicationStatus.DRAFT)

    def test_submit_notifies_staff_and_emails_both_parties(self):
        application = self.make_application()
        self.upload_mandatory_documents(application)
        client = self.auth(self.customer_user)

        response = client.post(f"/api/applications/{application.pk}/submit/")
        self.assertEqual(response.status_code, 200)

        application.refresh_from_db()
        self.assertEqual(application.status, ApplicationStatus.SUBMITTED)
        self.assertIsNotNone(application.submitted_at)

        # The officer is alerted, audibly, because nobody owns it yet.
        alert = Notification.objects.filter(
            recipient=self.officer,
            category=Notification.Category.NEW_APPLICATION,
        ).first()
        self.assertIsNotNone(alert)
        self.assertTrue(alert.play_sound)
        self.assertEqual(alert.reference_number, application.application_number)

        # The customer never receives the internal alert.
        self.assertFalse(
            Notification.objects.filter(
                recipient=self.customer_user,
                category=Notification.Category.NEW_APPLICATION,
            ).exists()
        )

        recipients = {log.to_email for log in EmailLog.objects.all()}
        self.assertIn("ahmad@test.local", recipients)
        self.assertIn("office@visacare.test", recipients)

        # Placeholders are resolved, not sent literally.
        customer_email = EmailLog.objects.get(to_email="ahmad@test.local")
        self.assertIn(application.application_number, customer_email.subject)
        self.assertNotIn("{{", customer_email.body)

        self.assertTrue(
            application.timeline.filter(action="Application submitted").exists()
        )

    def test_submitting_twice_is_rejected(self):
        application = self.make_application()
        self.upload_mandatory_documents(application)
        client = self.auth(self.customer_user)

        self.assertEqual(
            client.post(f"/api/applications/{application.pk}/submit/").status_code, 200
        )
        second = client.post(f"/api/applications/{application.pk}/submit/")
        self.assertEqual(second.status_code, 400)

    # --- isolation between customers (section 60) ------------------------

    def test_customer_cannot_see_another_customers_application(self):
        application = self.make_application()
        client = self.auth(self.other_customer)

        response = client.get(f"/api/applications/{application.pk}/")
        self.assertEqual(response.status_code, 404)

    def test_customer_cannot_download_another_customers_document(self):
        application = self.make_application()
        document = Document.objects.create(
            application=application,
            document_type=DocumentType.objects.get(code="passport"),
            file=pdf_upload(),
        )
        client = self.auth(self.other_customer)

        response = client.get(f"/api/documents/{document.pk}/download/")
        self.assertEqual(response.status_code, 404)

    def test_owner_can_download_their_own_document(self):
        application = self.make_application()
        document = Document.objects.create(
            application=application,
            document_type=DocumentType.objects.get(code="passport"),
            file=pdf_upload(),
        )
        client = self.auth(self.customer_user)

        response = client.get(f"/api/documents/{document.pk}/download/")
        self.assertEqual(response.status_code, 200)

    # --- document review (rules 3 and 4) ---------------------------------

    def test_rejecting_a_document_requires_a_reason(self):
        application = self.make_application()
        document = Document.objects.create(
            application=application,
            document_type=DocumentType.objects.get(code="passport"),
            file=pdf_upload(),
        )
        client = self.auth(self.officer)

        response = client.post(
            f"/api/documents/{document.pk}/reject/", {"reason": ""}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        document.refresh_from_db()
        self.assertEqual(document.status, Document.Status.PENDING)

    def test_rejection_notifies_customer_with_the_reason(self):
        application = self.make_application()
        document = Document.objects.create(
            application=application,
            document_type=DocumentType.objects.get(code="passport"),
            file=pdf_upload(),
        )
        client = self.auth(self.officer)

        response = client.post(
            f"/api/documents/{document.pk}/reject/",
            {"reason": "The passport image is unclear."},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        document.refresh_from_db()
        self.assertEqual(document.status, Document.Status.REJECTED)
        self.assertEqual(document.verified_by, self.officer)

        notification = Notification.objects.get(
            recipient=self.customer_user,
            category=Notification.Category.DOCUMENT_REJECTED,
        )
        self.assertIn("unclear", notification.message)

        email = EmailLog.objects.filter(to_email="ahmad@test.local").last()
        self.assertIn("unclear", email.body)

    def test_verification_records_the_reviewer_and_tells_the_customer(self):
        application = self.make_application()
        document = Document.objects.create(
            application=application,
            document_type=DocumentType.objects.get(code="passport"),
            file=pdf_upload(),
        )
        client = self.auth(self.officer)

        response = client.post(f"/api/documents/{document.pk}/verify/")
        self.assertEqual(response.status_code, 200)

        document.refresh_from_db()
        self.assertEqual(document.status, Document.Status.VERIFIED)
        self.assertEqual(document.verified_by, self.officer)
        self.assertIsNotNone(document.verified_at)

        self.assertTrue(
            Notification.objects.filter(
                recipient=self.customer_user,
                category=Notification.Category.DOCUMENT_VERIFIED,
            ).exists()
        )

    def test_reviewer_identity_is_hidden_from_the_customer(self):
        application = self.make_application()
        document = Document.objects.create(
            application=application,
            document_type=DocumentType.objects.get(code="passport"),
            file=pdf_upload(),
        )
        workflow_client = self.auth(self.officer)
        workflow_client.post(f"/api/documents/{document.pk}/verify/")

        staff_view = self.auth(self.officer).get(f"/api/documents/{document.pk}/")
        customer_view = self.auth(self.customer_user).get(
            f"/api/documents/{document.pk}/"
        )

        self.assertEqual(staff_view.data["verified_by_name"], "Omar Yilmaz")
        self.assertIsNone(customer_view.data["verified_by_name"])

    def test_reupload_supersedes_the_previous_file(self):
        application = self.make_application()
        passport = DocumentType.objects.get(code="passport")
        client = self.auth(self.customer_user)

        first = client.post(
            f"/api/applications/{application.pk}/documents/",
            {"document_type_id": passport.pk, "file": pdf_upload("first.pdf")},
            format="multipart",
        )
        self.assertEqual(first.status_code, 201)

        second = client.post(
            f"/api/applications/{application.pk}/documents/",
            {"document_type_id": passport.pk, "file": pdf_upload("second.pdf")},
            format="multipart",
        )
        self.assertEqual(second.status_code, 201)

        documents = Document.objects.filter(
            application=application, document_type=passport
        )
        self.assertEqual(documents.count(), 2)
        self.assertEqual(documents.filter(is_current=True).count(), 1)
        self.assertEqual(
            documents.get(is_current=True).original_filename, "second.pdf"
        )

    def test_upload_rejects_an_unsupported_file_type(self):
        application = self.make_application()
        passport = DocumentType.objects.get(code="passport")
        client = self.auth(self.customer_user)

        response = client.post(
            f"/api/applications/{application.pk}/documents/",
            {
                "document_type_id": passport.pk,
                "file": SimpleUploadedFile("virus.exe", b"MZ", "application/x-msdownload"),
            },
            format="multipart",
        )
        self.assertEqual(response.status_code, 400)

    # --- status transitions ----------------------------------------------

    def test_illegal_status_jump_is_refused(self):
        application = self.make_application()
        client = self.auth(self.officer)

        response = client.post(
            f"/api/applications/{application.pk}/change-status/",
            {"status": ApplicationStatus.APPROVED},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        application.refresh_from_db()
        self.assertEqual(application.status, ApplicationStatus.DRAFT)

    def test_customer_cannot_change_status(self):
        application = self.make_application()
        client = self.auth(self.customer_user)

        response = client.post(
            f"/api/applications/{application.pk}/change-status/",
            {"status": ApplicationStatus.UNDER_REVIEW},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_applications_are_cancelled_not_deleted(self):
        application = self.make_application()
        client = self.auth(self.customer_user)

        deletion = client.delete(f"/api/applications/{application.pk}/")
        self.assertEqual(deletion.status_code, 403)

        cancellation = client.post(
            f"/api/applications/{application.pk}/cancel/",
            {"reason": "Customer requested cancellation"},
            format="json",
        )
        self.assertEqual(cancellation.status_code, 200)

        application.refresh_from_db()
        self.assertEqual(application.status, ApplicationStatus.CANCELLED)
        self.assertEqual(
            application.cancellation_reason, "Customer requested cancellation"
        )
        # The record survives for company history.
        self.assertTrue(Application.objects.filter(pk=application.pk).exists())

    def test_locked_application_cannot_be_edited_by_the_customer(self):
        application = self.make_application(status=ApplicationStatus.VERIFIED)
        client = self.auth(self.customer_user)

        response = client.patch(
            f"/api/applications/{application.pk}/",
            {"phone": "+491700000000"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_full_cycle_to_approval(self):
        """Submission through approval, as section 65 describes it."""
        application = self.make_application()
        self.upload_mandatory_documents(application)

        customer = self.auth(self.customer_user)
        officer = self.auth(self.officer)

        customer.post(f"/api/applications/{application.pk}/submit/")

        for status_value in (
            ApplicationStatus.UNDER_REVIEW,
            ApplicationStatus.VERIFICATION,
            ApplicationStatus.VERIFIED,
            ApplicationStatus.PROCESSING,
            ApplicationStatus.APPROVED,
        ):
            response = officer.post(
                f"/api/applications/{application.pk}/change-status/",
                {"status": status_value},
                format="json",
            )
            self.assertEqual(
                response.status_code, 200, f"failed moving to {status_value}"
            )

        application.refresh_from_db()
        self.assertEqual(application.status, ApplicationStatus.APPROVED)
        self.assertIsNotNone(application.verified_at)
        self.assertIsNotNone(application.decided_at)

        # The customer was told at each step.
        self.assertTrue(
            Notification.objects.filter(
                recipient=self.customer_user,
                category=Notification.Category.APPLICATION_UPDATE,
            ).count()
            >= 5
        )
        self.assertTrue(
            EmailLog.objects.filter(
                to_email="ahmad@test.local", subject__icontains="approved"
            ).exists()
        )


class AssignmentTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command

        call_command("seed_demo", verbosity=0)
        cls.visa = VisaType.objects.get(slug="germany-student-visa")

        cls.admin = User.objects.create_user(
            email="admin@test.local",
            password="StrongPass2026!",
            role=User.Role.ADMIN,
        )
        cls.officer = User.objects.create_user(
            email="officer2@test.local",
            password="StrongPass2026!",
            role=User.Role.VISA_OFFICER,
        )
        customer_user = User.objects.create_user(
            email="customer2@test.local", password="StrongPass2026!"
        )
        cls.profile = CustomerProfile.objects.create(user=customer_user)

    def test_assignment_notifies_the_officer(self):
        application = Application.objects.create(
            customer=self.profile,
            visa_type=self.visa,
            first_name="Test",
            last_name="Customer",
        )
        client = APIClient()
        client.force_authenticate(user=self.admin)

        response = client.post(
            f"/api/applications/{application.pk}/assign/",
            {"staff_id": self.officer.pk, "priority": "high"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        application.refresh_from_db()
        self.assertEqual(application.assigned_to, self.officer)
        self.assertEqual(application.priority, "high")

        self.assertTrue(
            Notification.objects.filter(
                recipient=self.officer, application=application
            ).exists()
        )

    def test_officer_sees_only_their_assigned_applications(self):
        mine = Application.objects.create(
            customer=self.profile,
            visa_type=self.visa,
            first_name="Mine",
            last_name="Case",
            assigned_to=self.officer,
        )
        Application.objects.create(
            customer=self.profile,
            visa_type=self.visa,
            first_name="Someone",
            last_name="Else",
        )

        client = APIClient()
        client.force_authenticate(user=self.officer)
        response = client.get("/api/applications/")

        self.assertEqual(response.status_code, 200)
        returned = [row["id"] for row in response.data["results"]]
        self.assertEqual(returned, [mine.pk])
