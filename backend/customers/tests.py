"""Internal notes and the MIS reference endpoints."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from applications.models import Application
from visas.models import VisaType

from .models import CustomerProfile, InternalNote

User = get_user_model()


class InternalNoteTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command

        call_command("seed_demo", verbosity=0)
        cls.visa = VisaType.objects.get(slug="germany-student-visa")

        cls.officer = User.objects.create_user(
            email="officer@notes.test",
            password="StrongPass2026!",
            role=User.Role.VISA_OFFICER,
            first_name="Omar",
            last_name="Yilmaz",
        )
        cls.customer_user = User.objects.create_user(
            email="customer@notes.test", password="StrongPass2026!"
        )
        cls.profile = CustomerProfile.objects.create(user=cls.customer_user)
        cls.application = Application.objects.create(
            customer=cls.profile,
            visa_type=cls.visa,
            first_name="Ahmad",
            last_name="Khan",
            assigned_to=cls.officer,
        )

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def test_staff_can_add_a_note(self):
        client = self.client_for(self.officer)

        response = client.post(
            "/api/internal-notes/",
            {
                "application": self.application.pk,
                "body": "Customer needs an updated bank statement.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["author_name"], "Omar Yilmaz")

        note = InternalNote.objects.get()
        self.assertEqual(note.customer, self.profile)
        self.assertEqual(note.application, self.application)

    def test_customer_cannot_read_internal_notes(self):
        InternalNote.objects.create(
            customer=self.profile,
            application=self.application,
            author=self.officer,
            body="Internal only.",
        )
        client = self.client_for(self.customer_user)

        listing = client.get(f"/api/internal-notes/?application={self.application.pk}")
        self.assertEqual(listing.status_code, 403)

    def test_customer_cannot_write_an_internal_note(self):
        client = self.client_for(self.customer_user)

        response = client.post(
            "/api/internal-notes/",
            {"application": self.application.pk, "body": "Let me in"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_note_on_an_unassigned_application_is_readable_after_writing(self):
        """A note that vanishes after saving reads as a broken feature.

        New applications arrive unassigned, so scoping notes to assigned-only
        let an officer write one and immediately lose sight of it.
        """
        unassigned = Application.objects.create(
            customer=self.profile,
            visa_type=self.visa,
            first_name="Nobody",
            last_name="Yet",
        )
        client = self.client_for(self.officer)

        created = client.post(
            "/api/internal-notes/",
            {"application": unassigned.pk, "body": "Triage note."},
            format="json",
        )
        self.assertEqual(created.status_code, 201)

        listing = client.get(f"/api/internal-notes/?application={unassigned.pk}")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual([row["body"] for row in listing.data["results"]], ["Triage note."])

    def test_officer_cannot_note_a_colleagues_application(self):
        colleague = User.objects.create_user(
            email="colleague@notes.test",
            password="StrongPass2026!",
            role=User.Role.VISA_OFFICER,
        )
        theirs = Application.objects.create(
            customer=self.profile,
            visa_type=self.visa,
            first_name="Someone",
            last_name="Else",
            assigned_to=colleague,
        )
        client = self.client_for(self.officer)

        response = client.post(
            "/api/internal-notes/",
            {"application": theirs.pk, "body": "Not my case."},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_notes_are_filtered_to_one_application(self):
        other = Application.objects.create(
            customer=self.profile,
            visa_type=self.visa,
            first_name="Other",
            last_name="Case",
            assigned_to=self.officer,
        )
        InternalNote.objects.create(
            customer=self.profile,
            application=self.application,
            author=self.officer,
            body="First",
        )
        InternalNote.objects.create(
            customer=self.profile,
            application=other,
            author=self.officer,
            body="Second",
        )

        client = self.client_for(self.officer)
        response = client.get(f"/api/internal-notes/?application={self.application.pk}")

        self.assertEqual(response.status_code, 200)
        bodies = [row["body"] for row in response.data["results"]]
        self.assertEqual(bodies, ["First"])


class ReferenceEndpointTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command

        call_command("seed_demo", verbosity=0)

        cls.admin = User.objects.create_user(
            email="admin@ref.test", password="StrongPass2026!", role=User.Role.ADMIN
        )
        cls.cms = User.objects.create_user(
            email="cms@ref.test", password="StrongPass2026!", role=User.Role.CMS_MANAGER
        )
        cls.customer = User.objects.create_user(
            email="customer@ref.test", password="StrongPass2026!"
        )
        CustomerProfile.objects.create(user=cls.customer)

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def test_staff_list_excludes_customers_and_cms_managers(self):
        response = self.client_for(self.admin).get("/api/staff/")

        self.assertEqual(response.status_code, 200)
        emails = {row["email"] for row in response.data}
        self.assertIn("admin@ref.test", emails)
        self.assertNotIn("cms@ref.test", emails)
        self.assertNotIn("customer@ref.test", emails)

    def test_customer_cannot_read_the_staff_directory(self):
        response = self.client_for(self.customer).get("/api/staff/")
        self.assertEqual(response.status_code, 403)

    def test_document_types_are_available_to_customers(self):
        """Customers need them to label their own uploads."""
        response = self.client_for(self.customer).get("/api/document-types/")

        self.assertEqual(response.status_code, 200)
        codes = {row["code"] for row in response.data}
        self.assertIn("passport", codes)


class DetailSerializerTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command

        call_command("seed_demo", verbosity=0)
        cls.visa = VisaType.objects.get(slug="germany-student-visa")

        cls.officer = User.objects.create_user(
            email="officer@detail.test",
            password="StrongPass2026!",
            role=User.Role.VISA_OFFICER,
            first_name="Omar",
            last_name="Yilmaz",
        )
        cls.customer_user = User.objects.create_user(
            email="customer@detail.test",
            password="StrongPass2026!",
            first_name="Ahmad",
            last_name="Khan",
        )
        cls.profile = CustomerProfile.objects.create(user=cls.customer_user)
        cls.application = Application.objects.create(
            customer=cls.profile,
            visa_type=cls.visa,
            first_name="Ahmad",
            last_name="Khan",
            assigned_to=cls.officer,
        )

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def test_staff_see_customer_details_and_transitions(self):
        response = self.client_for(self.officer).get(
            f"/api/applications/{self.application.pk}/"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["customer"]["email"], "customer@detail.test")
        self.assertEqual(response.data["assigned_to"]["full_name"], "Omar Yilmaz")

        # Draft may only move to submitted or cancelled.
        transitions = {item["value"] for item in response.data["allowed_transitions"]}
        self.assertEqual(transitions, {"submitted", "cancelled"})

    def test_customer_sees_neither_officer_identity_nor_transitions(self):
        response = self.client_for(self.customer_user).get(
            f"/api/applications/{self.application.pk}/"
        )

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["customer"])
        self.assertEqual(response.data["allowed_transitions"], [])
        # Assignment is acknowledged without naming the officer.
        self.assertEqual(response.data["assigned_to"], {"id": None, "full_name": "Assigned"})
