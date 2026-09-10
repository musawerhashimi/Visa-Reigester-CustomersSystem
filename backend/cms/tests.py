"""CMS content management and the public contact form."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from notifications.models import Notification

from .models import Activity, ContactMessage, News, Service

User = get_user_model()


class CMSContentTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.cms_manager = User.objects.create_user(
            email="cms@content.test",
            password="StrongPass2026!",
            role=User.Role.CMS_MANAGER,
            first_name="Lena",
            last_name="Schmidt",
        )
        cls.officer = User.objects.create_user(
            email="officer@content.test",
            password="StrongPass2026!",
            role=User.Role.VISA_OFFICER,
        )
        cls.customer = User.objects.create_user(
            email="customer@content.test", password="StrongPass2026!"
        )

        cls.published = News.objects.create(
            slug="published-story",
            title={"en": "Published story", "de": "", "tr": ""},
            status=News.Status.PUBLISHED,
        )
        cls.draft = News.objects.create(
            slug="draft-story",
            title={"en": "Draft story", "de": "", "tr": ""},
            status=News.Status.DRAFT,
        )

    def client_for(self, user=None):
        client = APIClient()
        if user:
            client.force_authenticate(user=user)
        return client

    # --- visibility -------------------------------------------------------

    def test_visitor_sees_only_published_news(self):
        response = self.client_for().get("/api/cms/news/")

        self.assertEqual(response.status_code, 200)
        slugs = {row["slug"] for row in response.data["results"]}
        self.assertEqual(slugs, {"published-story"})

    def test_draft_is_not_reachable_by_slug(self):
        response = self.client_for().get("/api/cms/news/draft-story/")
        self.assertEqual(response.status_code, 404)

    def test_cms_manager_sees_drafts(self):
        response = self.client_for(self.cms_manager).get("/api/cms/news/")

        slugs = {row["slug"] for row in response.data["results"]}
        self.assertIn("draft-story", slugs)

    def test_customer_does_not_see_drafts(self):
        response = self.client_for(self.customer).get("/api/cms/news/")

        slugs = {row["slug"] for row in response.data["results"]}
        self.assertNotIn("draft-story", slugs)

    # --- authoring --------------------------------------------------------

    def test_cms_manager_can_create_translated_content(self):
        response = self.client_for(self.cms_manager).post(
            "/api/cms/news/",
            {
                "slug": "three-languages",
                "title": {"en": "Hello", "de": "Hallo", "tr": "Merhaba"},
                "status": "draft",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        article = News.objects.get(slug="three-languages")
        self.assertEqual(article.title["de"], "Hallo")
        self.assertEqual(article.title["tr"], "Merhaba")

    def test_partial_translation_is_stored_with_all_three_keys(self):
        """A half-filled form must not produce a record missing keys."""
        response = self.client_for(self.cms_manager).post(
            "/api/cms/news/",
            {
                "slug": "english-only",
                "title": {"en": "English only"},
                "status": "draft",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        article = News.objects.get(slug="english-only")
        self.assertEqual(set(article.title), {"en", "de", "tr"})
        self.assertEqual(article.title["de"], "")

    def test_unknown_language_is_rejected(self):
        response = self.client_for(self.cms_manager).post(
            "/api/cms/news/",
            {
                "slug": "bad-language",
                "title": {"en": "Hi", "fr": "Salut"},
                "status": "draft",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("title", response.data)

    def test_publishing_without_english_is_refused(self):
        """English is the fallback every other language resolves to."""
        article = News.objects.create(
            slug="no-english",
            title={"en": "", "de": "Nur Deutsch", "tr": ""},
            status=News.Status.DRAFT,
        )
        response = self.client_for(self.cms_manager).post(
            f"/api/cms/news/{article.slug}/publish/"
        )

        self.assertEqual(response.status_code, 400)
        article.refresh_from_db()
        self.assertEqual(article.status, News.Status.DRAFT)

    def test_publish_sets_the_publication_date(self):
        article = News.objects.create(
            slug="ready",
            title={"en": "Ready", "de": "", "tr": ""},
            status=News.Status.DRAFT,
        )
        response = self.client_for(self.cms_manager).post(
            f"/api/cms/news/{article.slug}/publish/"
        )

        self.assertEqual(response.status_code, 200)
        article.refresh_from_db()
        self.assertEqual(article.status, News.Status.PUBLISHED)
        self.assertIsNotNone(article.published_at)

    def test_unpublish_keeps_the_original_publication_date(self):
        article = News.objects.create(
            slug="temporary",
            title={"en": "Temporary", "de": "", "tr": ""},
            status=News.Status.DRAFT,
        )
        manager = self.client_for(self.cms_manager)
        manager.post(f"/api/cms/news/{article.slug}/publish/")
        article.refresh_from_db()
        first_published = article.published_at

        manager.post(f"/api/cms/news/{article.slug}/unpublish/")
        article.refresh_from_db()

        self.assertEqual(article.status, News.Status.DRAFT)
        self.assertEqual(article.published_at, first_published)

    def test_missing_translations_are_reported_to_the_editor(self):
        article = News.objects.create(
            slug="partly-translated",
            title={"en": "Title", "de": "Titel", "tr": ""},
            status=News.Status.DRAFT,
        )
        response = self.client_for(self.cms_manager).get(
            f"/api/cms/news/{article.slug}/"
        )

        self.assertEqual(response.data["missing_translations"], ["tr"])

    def test_untouched_field_is_not_reported_as_missing(self):
        """An unused field is not a translation gap."""
        article = News.objects.create(
            slug="title-only",
            title={"en": "T", "de": "T", "tr": "T"},
            content={"en": "", "de": "", "tr": ""},
            status=News.Status.DRAFT,
        )
        response = self.client_for(self.cms_manager).get(
            f"/api/cms/news/{article.slug}/"
        )

        self.assertEqual(response.data["missing_translations"], [])

    # --- permissions ------------------------------------------------------

    def test_visa_officer_cannot_edit_website_content(self):
        response = self.client_for(self.officer).post(
            "/api/cms/news/",
            {"slug": "officer-post", "title": {"en": "No"}, "status": "draft"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_visitor_cannot_create_content(self):
        response = self.client_for().post(
            "/api/cms/news/",
            {"slug": "anon-post", "title": {"en": "No"}},
            format="json",
        )
        self.assertIn(response.status_code, (401, 403))

    def test_cms_manager_cannot_reach_applications(self):
        """Section 42: the CMS role has no access to customer data."""
        response = self.client_for(self.cms_manager).get("/api/applications/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 0)

    def test_news_view_count_ignores_editors(self):
        article = News.objects.create(
            slug="counted",
            title={"en": "Counted", "de": "", "tr": ""},
            status=News.Status.PUBLISHED,
        )

        self.client_for(self.cms_manager).get(f"/api/cms/news/{article.slug}/")
        article.refresh_from_db()
        self.assertEqual(article.views, 0)

        self.client_for().get(f"/api/cms/news/{article.slug}/")
        article.refresh_from_db()
        self.assertEqual(article.views, 1)

    def test_service_and_activity_endpoints_work(self):
        manager = self.client_for(self.cms_manager)

        service = manager.post(
            "/api/cms/services/",
            {
                "slug": "consultation",
                "name": {"en": "Consultation", "de": "Beratung", "tr": "Danışmanlık"},
                "status": "published",
            },
            format="json",
        )
        self.assertEqual(service.status_code, 201)
        self.assertTrue(Service.objects.filter(slug="consultation").exists())

        activity = manager.post(
            "/api/cms/activities/",
            {
                "slug": "open-day",
                "title": {"en": "Open day", "de": "Tag der offenen Tür", "tr": "Açık gün"},
                "status": "published",
            },
            format="json",
        )
        self.assertEqual(activity.status_code, 201)
        self.assertTrue(Activity.objects.filter(slug="open-day").exists())


class ContactFormTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(
            email="admin@contact.test",
            password="StrongPass2026!",
            role=User.Role.SUPER_ADMIN,
        )
        cls.customer = User.objects.create_user(
            email="customer@contact.test", password="StrongPass2026!"
        )

    def test_visitor_can_submit_the_contact_form(self):
        response = APIClient().post(
            "/api/cms/contact-messages/",
            {
                "name": "Ahmad Khan",
                "email": "ahmad@example.test",
                "subject": "Student visa question",
                "message": "How long does a German student visa take?",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        message = ContactMessage.objects.get()
        self.assertEqual(message.status, ContactMessage.Status.NEW)

    def test_submission_alerts_the_office(self):
        APIClient().post(
            "/api/cms/contact-messages/",
            {"name": "Ahmad", "email": "a@example.test", "message": "Hello"},
            format="json",
        )

        self.assertTrue(
            Notification.objects.filter(
                recipient=self.admin,
                category=Notification.Category.CONTACT_MESSAGE,
            ).exists()
        )

    def test_customer_cannot_read_the_inbox(self):
        ContactMessage.objects.create(
            name="Someone", email="s@example.test", message="Private enquiry"
        )
        client = APIClient()
        client.force_authenticate(user=self.customer)

        response = client.get("/api/cms/contact-messages/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 0)

    def test_staff_reply_emails_the_sender_and_records_it(self):
        message = ContactMessage.objects.create(
            name="Ahmad", email="ahmad@example.test", subject="Question", message="Hi"
        )
        client = APIClient()
        client.force_authenticate(user=self.admin)

        response = client.post(
            f"/api/cms/contact-messages/{message.pk}/reply/",
            {"body": "Thank you for your enquiry. It takes 4-12 weeks."},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        message.refresh_from_db()
        self.assertEqual(message.status, ContactMessage.Status.REPLIED)
        self.assertIn("4-12 weeks", message.reply_body)
        self.assertIsNotNone(message.replied_at)

        from emails.models import EmailLog

        self.assertTrue(
            EmailLog.objects.filter(to_email="ahmad@example.test").exists()
        )
