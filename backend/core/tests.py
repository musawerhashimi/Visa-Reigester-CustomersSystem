from pathlib import Path

from django.test import TestCase, override_settings

# Create your tests here.


@override_settings(DEBUG=False, MEDIA_ROOT="/tmp/visacrm-media-test")
class PublicMediaTests(TestCase):
    """Only CMS imagery is public; customer files never are.

    Django serves nothing from MEDIA_URL once DEBUG is off, so production
    needs its own route — and that route is exactly where a mistake would
    hand a stranger somebody's passport.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        root = Path("/tmp/visacrm-media-test")
        for folder, name in [
            ("gallery", "photo.jpg"),
            ("company", "logo.png"),
            ("documents", "passport.pdf"),
            ("receipts", "RCPT-0001.pdf"),
            ("email_attachments", "bill.pdf"),
        ]:
            directory = root / folder
            directory.mkdir(parents=True, exist_ok=True)
            (directory / name).write_bytes(b"x")

    def test_cms_imagery_is_served(self):
        for url in ["/media/gallery/photo.jpg", "/media/company/logo.png"]:
            self.assertEqual(self.client.get(url).status_code, 200, url)

    def test_customer_documents_are_not_served(self):
        """A guessed URL must not reach a customer's paperwork."""
        for url in [
            "/media/documents/passport.pdf",
            "/media/receipts/RCPT-0001.pdf",
            "/media/email_attachments/bill.pdf",
        ]:
            self.assertEqual(self.client.get(url).status_code, 404, url)

    def test_path_traversal_is_refused(self):
        response = self.client.get("/media/../etc/passwd")
        self.assertEqual(response.status_code, 404)
