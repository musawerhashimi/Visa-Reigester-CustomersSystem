"""CMS content management and the public contact form."""

import io

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from notifications.models import Notification

from .models import Activity, CompanyInfo, ContactMessage, News, Service

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


@override_settings(MEDIA_ROOT="/tmp/visacrm-cms-test-media")
class GalleryMediaTests(TestCase):
    """A gallery holds photos and videos, uploaded or embedded."""

    @classmethod
    def setUpTestData(cls):
        cls.manager = User.objects.create_user(
            email="gallery@content.test",
            password="StrongPass2026!",
            role=User.Role.CMS_MANAGER,
        )

    def _client(self):
        client = APIClient()
        client.force_authenticate(user=self.manager)
        return client

    def _png(self, name="shot.png"):
        buffer = io.BytesIO()
        Image.new("RGB", (4, 4), "blue").save(buffer, "PNG")
        return SimpleUploadedFile(name, buffer.getvalue(), "image/png")

    def test_a_photo_is_uploaded_and_reads_as_an_image(self):
        response = self._client().post(
            "/api/cms/gallery/",
            {
                "title": '{"en": "Office", "de": "", "tr": ""}',
                "image": self._png(),
                "status": "published",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["kind"], "image")
        self.assertTrue(response.data["image"])

    def test_a_video_file_can_be_uploaded_with_a_poster_image(self):
        response = self._client().post(
            "/api/cms/gallery/",
            {
                "title": '{"en": "Opening day", "de": "", "tr": ""}',
                "image": self._png("poster.png"),
                "video": SimpleUploadedFile("clip.mp4", b"\x00\x00\x00 ftypmp42", "video/mp4"),
                "status": "published",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 201, response.data)
        # A video wins over the poster: the tile must play, not just sit there.
        self.assertEqual(response.data["kind"], "video")
        self.assertTrue(response.data["video"])
        self.assertTrue(response.data["image"], "poster should be kept")

    def test_a_video_can_be_an_embedded_link_instead(self):
        response = self._client().post(
            "/api/cms/gallery/",
            {
                "title": '{"en": "Interview", "de": "", "tr": ""}',
                "video_url": "https://www.youtube.com/watch?v=abc123",
                "status": "published",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["kind"], "video")

    def test_a_video_file_and_a_video_link_together_are_refused(self):
        """Two different videos, and `kind` cannot say which one to play."""
        response = self._client().post(
            "/api/cms/gallery/",
            {
                "title": '{"en": "Both", "de": "", "tr": ""}',
                "video": SimpleUploadedFile(
                    "clip.mp4", b"\x00\x00\x00 ftypmp42", "video/mp4"
                ),
                "video_url": "https://www.youtube.com/watch?v=abc123",
                "status": "published",
            },
            format="multipart",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("video", response.data)

    def test_clearing_the_video_turns_an_item_back_into_a_photo(self):
        """Switching the editor's type back to Photo sends empty video fields,
        which must actually clear them rather than be ignored."""
        created = self._client().post(
            "/api/cms/gallery/",
            {
                "title": '{"en": "Was a video", "de": "", "tr": ""}',
                "image": self._png("poster.png"),
                "video_url": "https://www.youtube.com/watch?v=abc123",
                "status": "published",
            },
            format="multipart",
        )
        self.assertEqual(created.data["kind"], "video")

        response = self._client().patch(
            f"/api/cms/gallery/{created.data['id']}/",
            {"video_url": "", "video": ""},
            format="multipart",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["kind"], "image")

    def test_an_entry_with_no_media_at_all_is_refused(self):
        """An empty tile on the public gallery helps nobody."""
        response = self._client().post(
            "/api/cms/gallery/",
            {"title": '{"en": "Nothing", "de": "", "tr": ""}', "status": "published"},
            format="multipart",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("image", response.data)

    def test_editing_without_touching_the_picture_keeps_it(self):
        """The editor omits an untouched media field rather than sending its
        URL back, which the API would reject as "not a file"."""
        created = self._client().post(
            "/api/cms/gallery/",
            {
                "title": '{"en": "Before", "de": "", "tr": ""}',
                "image": self._png(),
                "status": "published",
            },
            format="multipart",
        )
        item_id = created.data["id"]

        # A text-only edit carries no media keys at all.
        renamed = self._client().patch(
            f"/api/cms/gallery/{item_id}/",
            {"title": {"en": "After", "de": "", "tr": ""}},
            format="json",
        )

        self.assertEqual(renamed.status_code, 200, renamed.data)
        self.assertEqual(renamed.data["title"]["en"], "After")
        self.assertTrue(renamed.data["image"], "the picture must survive")

    def test_adding_a_video_to_an_existing_photo_keeps_the_photo(self):
        created = self._client().post(
            "/api/cms/gallery/",
            {
                "title": '{"en": "Poster", "de": "", "tr": ""}',
                "image": self._png(),
                "status": "published",
            },
            format="multipart",
        )
        item_id = created.data["id"]

        updated = self._client().patch(
            f"/api/cms/gallery/{item_id}/",
            {"video": SimpleUploadedFile("c.mp4", b"\x00\x00\x00 ftypmp42", "video/mp4")},
            format="multipart",
        )

        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertEqual(updated.data["kind"], "video")
        self.assertTrue(updated.data["image"], "the poster must survive")

    def test_visitors_see_published_gallery_items(self):
        self._client().post(
            "/api/cms/gallery/",
            {
                "title": '{"en": "Public", "de": "", "tr": ""}',
                "image": self._png(),
                "status": "published",
            },
            format="multipart",
        )

        listing = APIClient().get("/api/cms/gallery/")
        self.assertEqual(listing.status_code, 200)
        titles = {row["title"]["en"] for row in listing.data["results"]}
        self.assertIn("Public", titles)


class MailServerSettingsTests(TestCase):
    """The office configures SMTP in the MIS; the password never comes back."""

    def setUp(self):
        User = get_user_model()
        self.admin = User.objects.create_user(
            email="mail-admin@content.test", password="pw", role="super_admin"
        )
        self.customer = User.objects.create_user(
            email="mail-customer@content.test", password="pw", role="customer"
        )

    def _admin(self):
        client = APIClient()
        client.force_authenticate(user=self.admin)
        return client

    def test_the_password_is_stored_encrypted_and_never_returned(self):
        response = self._admin().patch(
            "/api/cms/company/",
            {"smtp_host": "smtp.test", "smtp_password": "hunter2"},
            format="json",
        )

        self.assertEqual(response.status_code, 200, response.data)
        self.assertNotIn("smtp_password", response.data)
        self.assertTrue(response.data["smtp_password_set"])

        info = CompanyInfo.load()
        self.assertNotIn("hunter2", info.smtp_password_encrypted)
        self.assertEqual(info.get_smtp_password(), "hunter2")

    def test_saving_other_fields_keeps_the_stored_password(self):
        client = self._admin()
        client.patch("/api/cms/company/", {"smtp_password": "keepme"}, format="json")

        client.patch("/api/cms/company/", {"smtp_host": "smtp.other"}, format="json")

        self.assertEqual(CompanyInfo.load().get_smtp_password(), "keepme")

    def test_mail_settings_are_hidden_from_everyone_else(self):
        self._admin().patch(
            "/api/cms/company/", {"smtp_host": "smtp.secret"}, format="json"
        )

        for client in (APIClient(), self._as(self.customer)):
            data = client.get("/api/cms/company/").data
            leaked = [key for key in data if key.startswith("smtp")]
            self.assertEqual(leaked, [], "mail settings must not be public")

    def _as(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def test_enabling_delivery_without_a_host_is_refused(self):
        response = self._admin().patch(
            "/api/cms/company/", {"smtp_enabled": True}, format="json"
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("smtp_host", response.data)
