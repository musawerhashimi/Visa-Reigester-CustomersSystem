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
        cls.manager = User.objects.create_user(
            email="manager@visas.test",
            password="StrongPass2026!",
            role=User.Role.ADMIN,
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

    def test_catalogue_manager_sees_drafts(self):
        client = APIClient()
        client.force_authenticate(user=self.manager)

        response = client.get("/api/visa-types/")

        slugs = {row["slug"] for row in response.data["results"]}
        self.assertIn("draft-visa", slugs)

    def test_cms_manager_does_not_see_drafts(self):
        """The visa catalogue is the product list, not website copy."""
        client = APIClient()
        client.force_authenticate(user=self.cms_manager)

        response = client.get("/api/visa-types/")

        slugs = {row["slug"] for row in response.data["results"]}
        self.assertNotIn("draft-visa", slugs)

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


class VisaCatalogueManagementTests(TestCase):
    """Staff maintain the catalogue the application form offers."""

    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command

        call_command("seed_demo", verbosity=0)

        cls.country_id = VisaType.objects.first().country_id
        # The catalogue is the business's product list, so an admin keeps it;
        # a CMS manager edits website copy and cannot reach it.
        cls.manager = User.objects.create_user(
            email="catalogue@visas.test",
            password="StrongPass2026!",
            role=User.Role.ADMIN,
        )
        cls.customer = User.objects.create_user(
            email="applicant@visas.test", password="StrongPass2026!"
        )

    def _manager(self):
        client = APIClient()
        client.force_authenticate(user=self.manager)
        return client

    def test_manager_creates_a_visa_type_the_form_then_offers(self):
        response = self._manager().post(
            "/api/visa-types/",
            {
                "slug": "germany-work-visa",
                "name": {"en": "Work Visa", "de": "Arbeitsvisum", "tr": ""},
                "country_id": self.country_id,
                "processing_time": {"en": "3 weeks", "de": "", "tr": ""},
                "fee_amount": "120.00",
                "status": "published",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["country"]["id"], self.country_id)

        # The applicant's visa step reads the public list, so a published
        # type must show up there without any further step.
        slugs = {row["slug"] for row in APIClient().get("/api/visa-types/").data["results"]}
        self.assertIn("germany-work-visa", slugs)

    def test_new_visa_type_stays_hidden_while_it_is_a_draft(self):
        self._manager().post(
            "/api/visa-types/",
            {
                "slug": "unfinished-visa",
                "name": {"en": "Unfinished", "de": "", "tr": ""},
                "country_id": self.country_id,
                "status": "draft",
            },
            format="json",
        )

        slugs = {row["slug"] for row in APIClient().get("/api/visa-types/").data["results"]}
        self.assertNotIn("unfinished-visa", slugs)

    def test_publishing_requires_an_english_name(self):
        response = self._manager().post(
            "/api/visa-types/",
            {
                "slug": "nameless-visa",
                "name": {"en": "", "de": "Visum", "tr": ""},
                "country_id": self.country_id,
                "status": "published",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("name", response.data)

    def test_manager_edits_and_removes_a_visa_type(self):
        client = self._manager()

        patch = client.patch(
            "/api/visa-types/germany-student-visa/",
            {"processing_time": {"en": "10 days", "de": "", "tr": ""}},
            format="json",
        )
        self.assertEqual(patch.status_code, 200)
        self.assertEqual(patch.data["processing_time"]["en"], "10 days")

        delete = client.delete("/api/visa-types/nameless-visa/")
        self.assertEqual(delete.status_code, 404)

    def test_a_visa_type_in_use_cannot_be_deleted(self):
        from applications.models import Application

        from customers.models import CustomerProfile

        visa = VisaType.objects.get(slug="germany-student-visa")
        Application.objects.create(
            customer=CustomerProfile.objects.create(user=self.customer),
            visa_type=visa,
        )

        response = self._manager().delete(f"/api/visa-types/{visa.slug}/")

        # A clear 400 rather than a database error: the applicant's record
        # keeps pointing at the visa they applied for.
        self.assertEqual(response.status_code, 400)
        self.assertTrue(VisaType.objects.filter(pk=visa.pk).exists())
        # The refusal names what is in the way, and — while the type is still
        # published — what to do instead.
        self.assertIn("1 application", response.data["detail"])
        self.assertIn("Set it to draft", response.data["detail"])

    def test_a_drafted_visa_type_is_not_told_to_draft_itself(self):
        """The refusal must not prescribe a step already taken.

        Drafting is what retires a visa type that applications still
        reference. Repeating that advice to someone who has just drafted it
        reads as though the refusal were their mistake, and hides that there
        is nothing further they can do.
        """
        from applications.models import Application

        from customers.models import CustomerProfile

        visa = VisaType.objects.get(slug="germany-student-visa")
        Application.objects.create(
            customer=CustomerProfile.objects.create(user=self.customer),
            visa_type=visa,
        )
        visa.status = VisaType.Status.DRAFT
        visa.save(update_fields=["status"])

        response = self._manager().delete(f"/api/visa-types/{visa.slug}/")

        self.assertEqual(response.status_code, 400)
        self.assertNotIn("Set it to draft", response.data["detail"])
        self.assertIn("already a draft", response.data["detail"])

    def test_manager_builds_the_document_checklist_of_a_new_visa_type(self):
        from documents.models import DocumentType

        client = self._manager()
        visa = client.post(
            "/api/visa-types/",
            {
                "slug": "germany-family-visa",
                "name": {"en": "Family Visa", "de": "", "tr": ""},
                "country_id": self.country_id,
                "status": "published",
            },
            format="json",
        ).data

        passport = DocumentType.objects.get(code="passport")
        line = client.post(
            "/api/visa-required-documents/",
            {
                "visa_type": visa["id"],
                "document_type": passport.id,
                "is_mandatory": True,
            },
            format="json",
        )
        self.assertEqual(line.status_code, 201, line.data)

        # The applicant's upload checklist is read off the visa type, so the
        # new requirement has to surface there.
        detail = client.get("/api/visa-types/germany-family-visa/").data
        codes = {
            item["document_type"]["code"] for item in detail["required_documents"]
        }
        self.assertEqual(codes, {"passport"})

        removed = client.delete(f"/api/visa-required-documents/{line.data['id']}/")
        self.assertEqual(removed.status_code, 204)

    def test_customers_cannot_read_or_edit_the_checklist_endpoint(self):
        client = APIClient()
        client.force_authenticate(user=self.customer)

        listing = client.get("/api/visa-required-documents/")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(listing.data, [])

        visa = VisaType.objects.get(slug="germany-student-visa")
        created = client.post(
            "/api/visa-required-documents/",
            {"visa_type": visa.pk, "document_type": 1, "is_mandatory": True},
            format="json",
        )
        self.assertEqual(created.status_code, 403)

    def test_customer_cannot_change_the_catalogue(self):
        client = APIClient()
        client.force_authenticate(user=self.customer)

        response = client.post(
            "/api/visa-types/",
            {
                "slug": "self-serve-visa",
                "name": {"en": "Self Serve", "de": "", "tr": ""},
                "country_id": self.country_id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.assertFalse(VisaType.objects.filter(slug="self-serve-visa").exists())

    def test_visitor_cannot_change_the_catalogue(self):
        response = APIClient().post(
            "/api/visa-types/",
            {"slug": "anonymous-visa", "country_id": self.country_id},
            format="json",
        )

        self.assertIn(response.status_code, (401, 403))

    def test_manager_adds_a_country_and_category(self):
        client = self._manager()

        country = client.post(
            "/api/countries/",
            {"code": "au", "name": {"en": "Australia", "de": "", "tr": ""}, "flag_emoji": "🇦🇺"},
            format="json",
        )
        self.assertEqual(country.status_code, 201, country.data)
        # Codes are normalised, so the catalogue never holds both de and DE.
        self.assertEqual(country.data["code"], "AU")

        category = client.post(
            "/api/visa-categories/",
            {
                "slug": "study",
                "name": {"en": "Study", "de": "Studium", "tr": ""},
                "status": "published",
            },
            format="json",
        )
        self.assertEqual(category.status_code, 201, category.data)

        visa = client.post(
            "/api/visa-types/",
            {
                "slug": "australia-study-visa",
                "name": {"en": "Study Permit", "de": "", "tr": ""},
                "country_id": country.data["id"],
                "category_id": category.data["id"],
                "status": "published",
            },
            format="json",
        )
        self.assertEqual(visa.status_code, 201, visa.data)
        self.assertEqual(visa.data["category"]["slug"], "study")
