"""Coverage of the branch partition: who sees which branch's work."""

from django.contrib.auth import get_user_model
from django.core import mail
from django.db.utils import IntegrityError
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from applications.models import Application, ApplicationStatus
from applications.services import workflow
from customers.models import CustomerProfile
from notifications.models import Notification
from visas.models import VisaType

from .models import Branch

User = get_user_model()


class BranchSetupMixin:
    """A general branch, a second office, and one application in each."""

    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command

        call_command("seed_demo", verbosity=0)

        cls.general = Branch.objects.get(is_general=True)
        cls.kabul = Branch.objects.create(name="Kabul", code="KBL", city="Kabul")

        cls.visa = VisaType.objects.get(slug="germany-student-visa")

        cls.head_officer = User.objects.create_user(
            email="head@test.local",
            password="StrongPass2026!",
            role=User.Role.ADMIN,
            branch=cls.general,
        )
        cls.kabul_officer = User.objects.create_user(
            email="kabul@test.local",
            password="StrongPass2026!",
            role=User.Role.ADMIN,
            branch=cls.kabul,
        )

        cls.customer_user = User.objects.create_user(
            email="applicant@test.local",
            password="StrongPass2026!",
            role=User.Role.CUSTOMER,
        )
        cls.customer = CustomerProfile.objects.create(user=cls.customer_user)

        cls.general_application = cls._application(cls.general, "Hana")
        cls.kabul_application = cls._application(cls.kabul, "Omid")

    @classmethod
    def _application(cls, branch, first_name):
        return Application.objects.create(
            customer=cls.customer,
            visa_type=cls.visa,
            branch=branch,
            first_name=first_name,
            last_name="Test",
            status=ApplicationStatus.SUBMITTED,
        )

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client


class BranchModelTests(TestCase):
    def test_the_migration_leaves_exactly_one_general_branch(self):
        self.assertEqual(Branch.objects.filter(is_general=True).count(), 1)
        self.assertEqual(Branch.general().code, "GEN")

    def test_a_second_general_branch_is_refused(self):
        """The partition rests on there being one head office, not two."""
        with self.assertRaises(IntegrityError):
            Branch.objects.create(name="Rival", code="RVL", is_general=True)

    def test_staff_created_without_a_branch_join_the_head_office(self):
        """Otherwise a scripted account would silently see nothing."""
        user = User.objects.create_user(
            email="scripted@test.local",
            password="StrongPass2026!",
            role=User.Role.VISA_OFFICER,
        )
        self.assertTrue(user.branch.is_general)

    def test_a_customer_is_not_given_a_branch(self):
        """Customers are global; they choose a branch per application."""
        user = User.objects.create_user(
            email="global@test.local", password="StrongPass2026!"
        )
        self.assertIsNone(user.branch)


class ApplicationScopingTests(BranchSetupMixin, TestCase):
    def test_the_general_branch_sees_every_branches_applications(self):
        response = self.client_for(self.head_officer).get("/api/applications/")
        returned = {row["id"] for row in response.data["results"]}
        self.assertIn(self.general_application.pk, returned)
        self.assertIn(self.kabul_application.pk, returned)

    def test_a_branch_sees_only_its_own_applications(self):
        response = self.client_for(self.kabul_officer).get("/api/applications/")
        returned = {row["id"] for row in response.data["results"]}
        self.assertEqual(returned, {self.kabul_application.pk})

    def test_a_branch_cannot_open_another_branches_application_by_id(self):
        """Hiding a row from a list is not enough if the detail view answers."""
        response = self.client_for(self.kabul_officer).get(
            f"/api/applications/{self.general_application.pk}/"
        )
        self.assertEqual(response.status_code, 404)

    def test_a_customer_still_sees_their_own_work_across_branches(self):
        response = self.client_for(self.customer_user).get("/api/applications/")
        returned = {row["id"] for row in response.data["results"]}
        self.assertEqual(
            returned, {self.general_application.pk, self.kabul_application.pk}
        )


class TransferTests(BranchSetupMixin, TestCase):
    def test_the_general_branch_can_transfer_an_application(self):
        response = self.client_for(self.head_officer).post(
            f"/api/applications/{self.general_application.pk}/transfer/",
            {"branch_id": self.kabul.pk},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        self.general_application.refresh_from_db()
        self.assertEqual(self.general_application.branch, self.kabul)
        # The old owner works elsewhere, so the work returns to the queue.
        self.assertIsNone(self.general_application.assigned_to)

    def test_a_branch_cannot_transfer_work_to_itself(self):
        response = self.client_for(self.kabul_officer).post(
            f"/api/applications/{self.general_application.pk}/transfer/",
            {"branch_id": self.kabul.pk},
            format="json",
        )
        # Transferring is refused before the lookup, so this is a 403 rather
        # than the 404 the branch would get from reading the record.
        self.assertEqual(response.status_code, 403)

        self.general_application.refresh_from_db()
        self.assertEqual(self.general_application.branch, self.general)

    def test_a_transfer_is_recorded_on_the_timeline(self):
        self.client_for(self.head_officer).post(
            f"/api/applications/{self.general_application.pk}/transfer/",
            {"branch_id": self.kabul.pk},
            format="json",
        )
        entries = self.general_application.timeline.values_list("action", flat=True)
        self.assertIn("Application transferred", entries)


class BranchAdministrationTests(BranchSetupMixin, TestCase):
    def test_the_general_branch_can_create_a_branch(self):
        response = self.client_for(self.head_officer).post(
            "/api/branches/",
            {"name": "Herat", "code": "hrt", "city": "Herat"},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        # Codes are stored upper-case whatever the form sent.
        self.assertEqual(response.data["code"], "HRT")

    def test_another_branch_cannot_create_a_branch(self):
        response = self.client_for(self.kabul_officer).post(
            "/api/branches/",
            {"name": "Herat", "code": "HRT"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_a_branch_only_lists_itself(self):
        response = self.client_for(self.kabul_officer).get("/api/branches/")
        returned = {row["code"] for row in response.data}
        self.assertEqual(returned, {"KBL"})

    def test_the_general_branch_cannot_be_deleted(self):
        response = self.client_for(self.head_officer).delete(
            f"/api/branches/{self.general.pk}/"
        )
        self.assertEqual(response.status_code, 400)
        self.assertTrue(Branch.objects.filter(pk=self.general.pk).exists())

    def test_a_branch_holding_work_cannot_be_deleted(self):
        """Deleting it would orphan applications that must be kept."""
        response = self.client_for(self.head_officer).delete(
            f"/api/branches/{self.kabul.pk}/"
        )
        self.assertEqual(response.status_code, 400)
        self.assertTrue(Branch.objects.filter(pk=self.kabul.pk).exists())

    def test_an_applicant_can_read_the_branches_to_apply_through(self):
        response = APIClient().get("/api/public-branches/")
        self.assertEqual(response.status_code, 200)
        codes = {row["code"] for row in response.data}
        self.assertIn("KBL", codes)


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    COMPANY_NOTIFICATION_EMAIL="office@visacare.test",
)
class NotificationRoutingTests(BranchSetupMixin, TestCase):
    """A new application must wake the branch it was sent to, and no other."""

    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.herat = Branch.objects.create(name="Herat", code="HRT")
        cls.herat_officer = User.objects.create_user(
            email="herat@test.local",
            password="StrongPass2026!",
            role=User.Role.VISA_OFFICER,
            branch=cls.herat,
        )

        # A visa needing no paperwork, so these tests exercise notification
        # routing rather than the upload rules covered elsewhere.
        cls.simple_visa = VisaType.objects.create(
            slug="no-documents-visa",
            name={"en": "No documents visa"},
            country=cls.visa.country,
            status=VisaType.Status.PUBLISHED,
        )

    def setUp(self):
        # Submitting requires a draft, and each test submits it itself.
        self.draft = Application.objects.create(
            customer=self.customer,
            visa_type=self.simple_visa,
            branch=self.kabul,
            first_name="Omid",
            last_name="Test",
            status=ApplicationStatus.DRAFT,
        )

    def _alerts_for(self, user):
        return Notification.objects.filter(
            recipient=user, category=Notification.Category.NEW_APPLICATION
        )

    def test_the_receiving_branch_is_alerted_with_sound(self):
        workflow.submit(self.draft)

        alert = self._alerts_for(self.kabul_officer).first()
        self.assertIsNotNone(alert)
        # Sound is what makes an arrival noticeable across the office.
        self.assertTrue(alert.play_sound)
        self.assertEqual(
            alert.reference_number, self.draft.application_number
        )

    def test_another_branch_is_not_alerted(self):
        workflow.submit(self.draft)
        self.assertFalse(self._alerts_for(self.herat_officer).exists())

    def test_the_general_branch_still_oversees_every_arrival(self):
        workflow.submit(self.draft)
        self.assertTrue(self._alerts_for(self.head_officer).exists())

    def test_an_assigned_application_only_interrupts_its_owner(self):
        """Assignment narrows the alert, whatever branch the work is in."""
        self.draft.assigned_to = self.kabul_officer
        self.draft.save(update_fields=["assigned_to"])

        workflow.submit(self.draft)

        self.assertTrue(self._alerts_for(self.kabul_officer).exists())
        self.assertFalse(self._alerts_for(self.head_officer).exists())

    def test_the_branch_inbox_receives_the_arrival_email(self):
        """A branch with its own inbox is told directly, not head office."""
        self.kabul.email = "kabul@office.test"
        self.kabul.save(update_fields=["email"])

        mail.outbox.clear()
        workflow.submit(self.draft)

        recipients = [address for message in mail.outbox for address in message.to]
        self.assertIn("kabul@office.test", recipients)


class StaffBranchTests(BranchSetupMixin, TestCase):
    def test_a_branch_cannot_place_staff_in_another_branch(self):
        response = self.client_for(self.kabul_officer).post(
            "/api/accounts/",
            {
                "email": "planted@test.local",
                "role": User.Role.VISA_OFFICER,
                "branch_id": self.general.pk,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_the_general_branch_can_place_staff_anywhere(self):
        response = self.client_for(self.head_officer).post(
            "/api/accounts/",
            {
                "email": "posted@test.local",
                "role": User.Role.VISA_OFFICER,
                "branch_id": self.kabul.pk,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["branch"]["code"], "KBL")

    def test_the_signed_in_user_is_told_their_branch(self):
        response = self.client_for(self.kabul_officer).get("/api/auth/me/")
        self.assertEqual(response.data["branch"]["code"], "KBL")
        self.assertFalse(response.data["sees_all_branches"])


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class BranchMailConfigTests(BranchSetupMixin, TestCase):
    """A branch sends as itself so customer replies reach the right office."""

    def test_a_branch_without_config_uses_the_company_address(self):
        from emails.services import sender_address

        self.assertEqual(sender_address(self.kabul), sender_address(None))

    def test_a_branch_sends_from_its_own_address(self):
        from emails.services import sender_address

        self.kabul.sending_email = "kabul@office.test"
        self.kabul.save(update_fields=["sending_email"])

        self.assertEqual(sender_address(self.kabul), "kabul@office.test")
        # The other office is unaffected.
        self.assertNotEqual(sender_address(self.general), "kabul@office.test")

    def test_mail_about_an_application_goes_out_as_its_branch(self):
        from django.core import mail
        from emails import services as email_service

        self.kabul.sending_email = "kabul@office.test"
        self.kabul.save(update_fields=["sending_email"])

        mail.outbox.clear()
        email_service.send_email(
            to_email="customer@test.local",
            subject="Test",
            body="Body",
            application=self.kabul_application,
        )
        self.assertEqual(mail.outbox[0].from_email, "kabul@office.test")

    def test_a_branch_uses_its_own_server_when_it_has_one(self):
        from emails.services import mail_connection

        self.kabul.smtp_host = "smtp.kabul.test"
        self.kabul.smtp_port = 587
        self.kabul.set_smtp_password("secret")
        self.kabul.smtp_enabled = True
        self.kabul.save()

        connection = mail_connection(self.kabul)
        self.assertEqual(connection.host, "smtp.kabul.test")

    def test_an_unconfigured_branch_does_not_borrow_another_server(self):
        """Falling through to the company is right; to a sibling is not."""
        from emails.services import mail_connection

        self.kabul.smtp_host = "smtp.kabul.test"
        self.kabul.smtp_enabled = True
        self.kabul.save()

        connection = mail_connection(self.general)
        host = getattr(connection, "host", None)
        self.assertNotEqual(host, "smtp.kabul.test")

    def test_the_password_is_encrypted_and_never_returned(self):
        self.kabul.set_smtp_password("supersecret")
        self.kabul.smtp_host = "smtp.kabul.test"
        self.kabul.smtp_enabled = True
        self.kabul.save()

        # Stored encrypted, not as typed.
        self.assertNotIn("supersecret", self.kabul.smtp_password_encrypted)
        self.assertEqual(self.kabul.get_smtp_password(), "supersecret")

        response = self.client_for(self.head_officer).get("/api/branches/")
        body = str(response.data)
        self.assertNotIn("supersecret", body)
        self.assertNotIn("smtp_password_encrypted", body)

    def test_enabling_a_server_without_a_host_is_refused(self):
        """It would fail silently on every send."""
        response = self.client_for(self.head_officer).patch(
            f"/api/branches/{self.kabul.pk}/",
            {"smtp_enabled": True},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_saving_without_a_password_keeps_the_stored_one(self):
        self.kabul.set_smtp_password("keepme")
        self.kabul.smtp_host = "smtp.kabul.test"
        self.kabul.smtp_enabled = True
        self.kabul.save()

        self.client_for(self.head_officer).patch(
            f"/api/branches/{self.kabul.pk}/",
            {"smtp_username": "changed"},
            format="json",
        )

        self.kabul.refresh_from_db()
        self.assertEqual(self.kabul.smtp_username, "changed")
        self.assertEqual(self.kabul.get_smtp_password(), "keepme")

    def test_a_branch_cannot_change_its_own_mail_settings(self):
        """Otherwise a branch could redirect customer mail to an outside box."""
        response = self.client_for(self.kabul_officer).patch(
            f"/api/branches/{self.kabul.pk}/",
            {"sending_email": "elsewhere@attacker.test"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

        self.kabul.refresh_from_db()
        self.assertEqual(self.kabul.sending_email, "")


class CompanySettingsAccessTests(BranchSetupMixin, TestCase):
    """Company-wide settings belong to head office, not to each branch."""

    def test_a_branch_cannot_read_the_company_mail_settings(self):
        """Reading the server is the first step to repointing it."""
        response = self.client_for(self.kabul_officer).get("/api/cms/company/")

        self.assertEqual(response.status_code, 200)
        for field in ("smtp_host", "smtp_username", "smtp_enabled", "sending_email"):
            self.assertNotIn(field, response.data)

    def test_the_general_branch_can_read_them(self):
        response = self.client_for(self.head_officer).get("/api/cms/company/")
        self.assertIn("smtp_host", response.data)

    def test_a_branch_cannot_change_company_settings(self):
        response = self.client_for(self.kabul_officer).patch(
            "/api/cms/company/", {"phone": "000"}, format="json"
        )
        self.assertEqual(response.status_code, 403)

    def test_a_branch_cannot_send_a_company_mail_test(self):
        """It authenticates as the company mailbox, so it is head office's."""
        response = self.client_for(self.kabul_officer).post(
            "/api/cms/mail-test/", {"email": "x@test.local"}, format="json"
        )
        self.assertEqual(response.status_code, 403)
