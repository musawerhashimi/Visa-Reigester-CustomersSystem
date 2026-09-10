"""Public visa catalogue, shared by the website and the application form."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from .models import VisaType

User = get_user_model()


class VisaCatalogueTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command

        call_command("seed_demo", verbosity=0)

        cls.draft = VisaType.objects.create(
            slug="draft-visa",
            name={"en": "Draft Visa", "de": "", "tr": ""},
            country_id=VisaType.objects.first().country_id,
            status=VisaType.Status.DRAFT,
        )
        cls.cms_manager = User.objects.create_user(
            email="cms@visas.test",
            password="StrongPass2026!",
            role=User.Role.CMS_MANAGER,
        )
        cls.customer = User.objects.create_user(
            email="customer@visas.test", password="StrongPass2026!"
        )

    def test_visitor_can_browse_published_visa_types(self):
        response = APIClient().get("/api/visa-types/")

        self.assertEqual(response.status_code, 200)
        slugs = {row["slug"] for row in response.data["results"]}
        self.assertIn("germany-student-visa", slugs)

    def test_draft_visa_types_are_hidden_from_visitors(self):
        response = APIClient().get("/api/visa-types/")

        slugs = {row["slug"] for row in response.data["results"]}
        self.assertNotIn("draft-visa", slugs)

        # Nor reachable directly by guessing the slug.
        detail = APIClient().get("/api/visa-types/draft-visa/")
        self.assertEqual(detail.status_code, 404)

    def test_cms_manager_sees_drafts(self):
        client = APIClient()
        client.force_authenticate(user=self.cms_manager)

        response = client.get("/api/visa-types/")

        slugs = {row["slug"] for row in response.data["results"]}
        self.assertIn("draft-visa", slugs)

    def test_customer_does_not_see_drafts(self):
        client = APIClient()
        client.force_authenticate(user=self.customer)

        response = client.get("/api/visa-types/")

        slugs = {row["slug"] for row in response.data["results"]}
        self.assertNotIn("draft-visa", slugs)

    def test_visa_type_carries_its_document_checklist(self):
        response = APIClient().get("/api/visa-types/germany-student-visa/")

        self.assertEqual(response.status_code, 200)
        required = response.data["required_documents"]
        self.assertTrue(required)

        codes = {item["document_type"]["code"] for item in required}
        self.assertIn("passport", codes)
        # The checklist drives the customer's upload step, so it must say
        # which items block submission.
        self.assertIn("is_mandatory", required[0])

    def test_translations_are_returned_for_all_three_languages(self):
        response = APIClient().get("/api/visa-types/germany-student-visa/")

        name = response.data["name"]
        self.assertEqual(name["en"], "Student Visa")
        self.assertEqual(name["de"], "Studentenvisum")
        self.assertEqual(name["tr"], "Öğrenci Vizesi")

    def test_countries_are_public(self):
        response = APIClient().get("/api/countries/")

        self.assertEqual(response.status_code, 200)
        codes = {row["code"] for row in response.data}
        self.assertIn("DE", codes)
