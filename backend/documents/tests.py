"""Asking a customer for a document they have not uploaded."""

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from applications.models import Application
from customers.models import CustomerProfile
from visas.models import VisaType

from .models import DocumentType

User = get_user_model()


class DocumentRequestTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        call_command("seed_demo", verbosity=0)

        cls.visa = VisaType.objects.get(slug="germany-student-visa")
        cls.customer_user = User.objects.create_user(
            email="applicant@documents.test", password="StrongPass2026!"
        )
        cls.officer = User.objects.create_user(
            email="officer@documents.test",
            password="StrongPass2026!",
            role=User.Role.VISA_OFFICER,
        )
        # An officer reaches only the applications assigned to them.
        cls.application = Application.objects.create(
            customer=CustomerProfile.objects.create(user=cls.customer_user),
            visa_type=cls.visa,
            assigned_to=cls.officer,
        )
        cls.passport = DocumentType.objects.get(code="passport")

    def _url(self):
        return f"/api/applications/{self.application.pk}/documents/request/"

    def _officer(self):
        client = APIClient()
        client.force_authenticate(user=self.officer)
        return client

    def test_staff_request_a_document_as_json(self):
        """The MIS posts JSON here; the upload endpoint's multipart parser
        must not reject it."""
        response = self._officer().post(
            self._url(),
            {"document_type_id": self.passport.pk, "message": "Please upload this."},
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["document_type"]["code"], "passport")

    def test_a_form_encoded_request_still_works(self):
        response = self._officer().post(
            self._url(),
            {"document_type_id": self.passport.pk, "message": "Please upload this."},
        )

        self.assertEqual(response.status_code, 201, response.data)

    def test_the_message_is_optional(self):
        response = self._officer().post(
            self._url(), {"document_type_id": self.passport.pk}, format="json"
        )

        self.assertEqual(response.status_code, 201, response.data)

    def test_an_unknown_document_type_is_rejected(self):
        response = self._officer().post(
            self._url(), {"document_type_id": 9999}, format="json"
        )

        self.assertEqual(response.status_code, 400)

    def test_a_requested_document_reaches_the_customers_application(self):
        """The upload panel is built from this, so a request that never
        appears here is invisible to the applicant."""
        self._officer().post(
            self._url(),
            {"document_type_id": self.passport.pk, "message": "Colour scan please."},
            format="json",
        )

        client = APIClient()
        client.force_authenticate(user=self.customer_user)
        detail = client.get(f"/api/applications/{self.application.pk}/").data

        requests = detail["document_requests"]
        self.assertEqual(len(requests), 1)
        self.assertEqual(requests[0]["document_type"]["code"], "passport")
        self.assertEqual(requests[0]["message"], "Colour scan please.")

    def test_a_customer_cannot_request_documents(self):
        client = APIClient()
        client.force_authenticate(user=self.customer_user)

        response = client.post(
            self._url(), {"document_type_id": self.passport.pk}, format="json"
        )

        self.assertEqual(response.status_code, 403)
