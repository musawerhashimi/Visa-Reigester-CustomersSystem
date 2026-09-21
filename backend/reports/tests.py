"""Reporting and exports."""

import io
import zipfile
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from applications.models import Application, ApplicationStatus
from audit.models import AuditLog
from customers.models import CustomerProfile
from payments import services as payment_services
from visas.models import VisaType

from . import services

User = get_user_model()


@override_settings(
    MEDIA_ROOT="/tmp/visacrm-report-test-media",
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
)
class ReportTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        from django.core.management import call_command

        call_command("seed_demo", verbosity=0)
        cls.student = VisaType.objects.get(slug="germany-student-visa")
        cls.tourist = VisaType.objects.get(slug="turkiye-tourist-visa")

        cls.admin = User.objects.create_user(
            email="admin@report.test",
            password="StrongPass2026!",
            role=User.Role.SUPER_ADMIN,
        )
        cls.officer = User.objects.create_user(
            email="officer@report.test",
            password="StrongPass2026!",
            role=User.Role.VISA_OFFICER,
        )
        cls.cms_manager = User.objects.create_user(
            email="cms@report.test",
            password="StrongPass2026!",
            role=User.Role.CMS_MANAGER,
        )
        customer_user = User.objects.create_user(
            email="ahmad@report.test",
            password="StrongPass2026!",
            first_name="Ahmad",
            last_name="Khan",
        )
        cls.profile = CustomerProfile.objects.create(
            user=customer_user, country="Afghanistan"
        )

        now = timezone.now()
        # Three approved, one rejected, one still processing.
        for index in range(3):
            Application.objects.create(
                customer=cls.profile,
                visa_type=cls.student,
                first_name=f"Approved{index}",
                last_name="Case",
                status=ApplicationStatus.APPROVED,
                submitted_at=now - timedelta(days=30),
                decided_at=now - timedelta(days=10),
            )
        Application.objects.create(
            customer=cls.profile,
            visa_type=cls.student,
            first_name="Rejected",
            last_name="Case",
            status=ApplicationStatus.REJECTED,
            submitted_at=now - timedelta(days=20),
            decided_at=now - timedelta(days=5),
        )
        cls.processing = Application.objects.create(
            customer=cls.profile,
            visa_type=cls.tourist,
            first_name="Pending",
            last_name="Case",
            status=ApplicationStatus.PROCESSING,
            submitted_at=now - timedelta(days=3),
        )

    def client_for(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    # --- email traffic ----------------------------------------------------

    def _email(self, application, *, status, automatic=True):
        from emails.models import EmailLog

        return EmailLog.objects.create(
            to_email="ahmad@report.test",
            subject="Update",
            body="…",
            application=application,
            status=status,
            is_automatic=automatic,
        )

    def test_email_report_counts_both_directions(self):
        from cms.models import ContactMessage
        from emails.models import EmailLog

        self._email(self.processing, status=EmailLog.Status.SENT)
        self._email(self.processing, status=EmailLog.Status.FAILED)
        ContactMessage.objects.create(
            name="Ahmad", email="ahmad@report.test", message="Where is my visa?"
        )

        report = services.build("emails")

        self.assertEqual(report["summary"]["Total sent to customers"], 2)
        self.assertEqual(report["summary"]["Delivered"], 1)
        self.assertEqual(report["summary"]["Failed"], 1)
        self.assertEqual(report["summary"]["Total received from customers"], 1)

    def test_a_branch_sees_only_its_own_sent_email(self):
        """The general branch totals the company; a branch totals itself."""
        from branches.models import Branch
        from emails.models import EmailLog

        other = Branch.objects.create(name="Kabul", code="KBL", is_general=False)
        theirs = Application.objects.create(
            customer=self.profile,
            visa_type=self.student,
            first_name="Other",
            last_name="Branch",
            status=ApplicationStatus.PROCESSING,
            branch=other,
        )
        self._email(self.processing, status=EmailLog.Status.SENT)
        self._email(theirs, status=EmailLog.Status.SENT)

        company = services.build("emails")
        branch = services.build("emails", branch=other.id)

        self.assertEqual(company["summary"]["Total sent to customers"], 2)
        self.assertEqual(branch["summary"]["Total sent to customers"], 1)

    def test_contact_messages_are_not_double_counted_per_branch(self):
        """The public form names no office, so only the company report has it."""
        from branches.models import Branch
        from cms.models import ContactMessage

        ContactMessage.objects.create(
            name="Ahmad", email="ahmad@report.test", message="Hello"
        )
        other = Branch.objects.create(name="Herat", code="HRT", is_general=False)

        company = services.build("emails")
        branch = services.build("emails", branch=other.id)

        self.assertEqual(company["summary"]["Total received from customers"], 1)
        self.assertEqual(branch["summary"]["Total received from customers"], 0)
        # A branch is told why, rather than reading 0 as "nobody wrote in".
        self.assertIn("Received from customers", branch["summary"])

    # --- aggregation ------------------------------------------------------

    def test_applications_report_counts_by_status(self):
        report = services.build("applications")

        counts = {row["status"]: row["count"] for row in report["rows"]}
        self.assertEqual(counts["Approved"], 3)
        self.assertEqual(counts["Rejected"], 1)
        self.assertEqual(report["summary"]["Total applications"], 5)

    def test_success_rate_counts_only_decided_applications(self):
        """A pending application is neither a success nor a failure."""
        report = services.build("applications")

        # 3 approved of 4 decided, not of 5 total.
        self.assertEqual(report["summary"]["Decided"], 4)
        self.assertEqual(report["summary"]["Success rate"], "75.0%")

    def test_visa_report_groups_by_country(self):
        report = services.build("visas", group="country")

        rows = {row["name"]: row for row in report["rows"]}
        self.assertEqual(rows["Germany"]["total"], 4)
        self.assertEqual(rows["Germany"]["approved"], 3)
        self.assertEqual(rows["Türkiye"]["total"], 1)

    def test_visa_report_groups_by_type(self):
        report = services.build("visas", group="type")

        names = {row["name"] for row in report["rows"]}
        self.assertIn("Student Visa", names)
        self.assertIn("Tourist Visa", names)

    def test_processing_time_excludes_undecided_applications(self):
        report = services.build("processing-time")

        numbers = {row["application"] for row in report["rows"]}
        self.assertNotIn(self.processing.application_number, numbers)
        self.assertEqual(len(report["rows"]), 4)
        self.assertGreater(report["summary"]["Average days"], 0)

    def test_date_range_is_inclusive_of_the_end_day(self):
        """01-30 September must include applications made on the 30th.

        The class fixtures are all created today, so the range is anchored on
        a past day that holds exactly one record.
        """
        Application.objects.all().delete()
        anchor = (timezone.now() - timedelta(days=40)).date()
        application = Application.objects.create(
            customer=self.profile,
            visa_type=self.student,
            first_name="Anchor",
            last_name="Case",
        )
        # created_at is auto-set, so move it onto the anchor day's last second.
        Application.objects.filter(pk=application.pk).update(
            created_at=timezone.make_aware(
                datetime.combine(anchor, time(23, 59, 59))
            )
        )

        inside = services.build(
            "applications", date_from=anchor.isoformat(), date_to=anchor.isoformat()
        )
        before = services.build(
            "applications",
            date_from=(anchor - timedelta(days=2)).isoformat(),
            date_to=(anchor - timedelta(days=1)).isoformat(),
        )

        self.assertEqual(inside["summary"]["Total applications"], 1)
        self.assertEqual(before["summary"]["Total applications"], 0)

    def test_financial_report_totals_settled_payments(self):
        application = Application.objects.create(
            customer=self.profile,
            visa_type=self.student,
            first_name="Paying",
            last_name="Customer",
        )
        payment_services.record_payment(
            application, amount=Decimal("500.00"), actor=self.admin
        )
        payment_services.record_payment(
            application, amount=Decimal("250.00"), actor=self.admin
        )

        report = services.build("financial")

        self.assertEqual(report["summary"]["Settled payments"], 2)
        self.assertEqual(report["summary"]["Total received"], "750.00")

    def test_customers_report_groups_by_country(self):
        report = services.build("customers")

        rows = {row["country"]: row for row in report["rows"]}
        self.assertIn("Afghanistan", rows)
        self.assertEqual(report["summary"]["Total customers"], 1)

    def test_over_time_report_buckets_by_interval(self):
        report = services.build("over-time", interval="month")

        self.assertTrue(report["rows"])
        self.assertEqual(
            sum(row["applications"] for row in report["rows"]),
            report["summary"]["Total applications"],
        )

    def test_empty_range_produces_an_empty_report_not_an_error(self):
        report = services.build(
            "applications", date_from="2001-01-01", date_to="2001-12-31"
        )

        self.assertEqual(report["rows"], [])
        self.assertEqual(report["summary"]["Total applications"], 0)
        self.assertEqual(report["summary"]["Success rate"], "—")

    # --- API --------------------------------------------------------------

    def test_report_endpoint_returns_rows(self):
        response = self.client_for(self.admin).get("/api/reports/applications/")

        self.assertEqual(response.status_code, 200)
        self.assertIn("rows", response.data)
        self.assertIn("summary", response.data)

    def test_unknown_report_is_rejected(self):
        response = self.client_for(self.admin).get("/api/reports/not-a-report/")
        self.assertEqual(response.status_code, 400)

    def test_malformed_date_is_rejected_cleanly(self):
        response = self.client_for(self.admin).get(
            "/api/reports/applications/?date_from=last-tuesday"
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("date", response.data)

    # --- exports ----------------------------------------------------------

    def test_csv_export_is_readable_by_excel(self):
        response = self.client_for(self.admin).get(
            "/api/reports/applications/export/?export_format=csv"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/csv")
        self.assertIn("attachment", response["Content-Disposition"])

        content = response.content.decode("utf-8")
        self.assertTrue(content.startswith("﻿"))  # BOM, so Excel reads UTF-8
        self.assertIn("Status", content)
        self.assertIn("Approved", content)
        self.assertIn("Summary", content)

    def test_xlsx_export_is_a_valid_workbook(self):
        response = self.client_for(self.admin).get(
            "/api/reports/visas/export/?export_format=xlsx"
        )

        self.assertEqual(response.status_code, 200)
        archive = zipfile.ZipFile(io.BytesIO(response.content))
        self.assertIsNone(archive.testzip())

        names = set(archive.namelist())
        self.assertIn("xl/workbook.xml", names)
        self.assertIn("xl/worksheets/sheet1.xml", names)

        sheet = archive.read("xl/worksheets/sheet1.xml").decode("utf-8")
        self.assertIn("Germany", sheet)

    def test_pdf_export_is_a_real_pdf(self):
        response = self.client_for(self.admin).get(
            "/api/reports/applications/export/?export_format=pdf"
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertTrue(response.content.startswith(b"%PDF-"))
        self.assertGreater(len(response.content), 1000)

    def test_unsupported_export_format_is_rejected(self):
        response = self.client_for(self.admin).get(
            "/api/reports/applications/export/?export_format=docx"
        )
        self.assertEqual(response.status_code, 400)

    def test_export_is_audited(self):
        """Exports carry customer data out, so who took what is recorded."""
        AuditLog.objects.all().delete()

        self.client_for(self.admin).get(
            "/api/reports/customers/export/?export_format=csv"
        )

        entry = AuditLog.objects.filter(action="export", module="reports").first()
        self.assertIsNotNone(entry)
        self.assertEqual(entry.actor, self.admin)
        self.assertIn("csv", entry.description)

    # --- permissions ------------------------------------------------------

    def test_officer_without_reports_view_is_refused(self):
        response = self.client_for(self.officer).get("/api/reports/applications/")
        self.assertEqual(response.status_code, 403)

    def test_cms_manager_cannot_read_reports(self):
        """Section 42: the CMS role sees no customer data."""
        response = self.client_for(self.cms_manager).get("/api/reports/customers/")
        self.assertEqual(response.status_code, 403)

    def test_customer_cannot_reach_reports(self):
        customer = User.objects.create_user(
            email="nosy@report.test", password="StrongPass2026!"
        )
        response = self.client_for(customer).get("/api/reports/applications/")
        self.assertEqual(response.status_code, 403)

    def test_listing_tells_the_caller_whether_they_can_export(self):
        response = self.client_for(self.admin).get("/api/reports/")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["can_export"])
        self.assertIn("csv", response.data["formats"])
