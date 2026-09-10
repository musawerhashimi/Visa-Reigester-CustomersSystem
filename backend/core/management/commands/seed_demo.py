"""Seed reference data and demo accounts for local development."""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from documents.models import DocumentType
from emails.models import EmailTemplate
from visas.models import Country, RequiredDocument, VisaType

User = get_user_model()

COUNTRIES = [
    ("DE", {"en": "Germany", "de": "Deutschland", "tr": "Almanya"}, "🇩🇪"),
    ("TR", {"en": "Türkiye", "de": "Türkei", "tr": "Türkiye"}, "🇹🇷"),
    ("US", {"en": "United States", "de": "Vereinigte Staaten", "tr": "Amerika Birleşik Devletleri"}, "🇺🇸"),
    ("GB", {"en": "United Kingdom", "de": "Vereinigtes Königreich", "tr": "Birleşik Krallık"}, "🇬🇧"),
    ("CA", {"en": "Canada", "de": "Kanada", "tr": "Kanada"}, "🇨🇦"),
]

DOCUMENT_TYPES = [
    ("passport", {"en": "Passport", "de": "Reisepass", "tr": "Pasaport"}),
    ("passport-photo", {"en": "Passport Photo", "de": "Passfoto", "tr": "Vesikalık Fotoğraf"}),
    ("national-id", {"en": "National ID", "de": "Personalausweis", "tr": "Kimlik Kartı"}),
    ("bank-statement", {"en": "Bank Statement", "de": "Kontoauszug", "tr": "Banka Hesap Dökümü"}),
    ("admission-letter", {"en": "Admission Letter", "de": "Zulassungsbescheid", "tr": "Kabul Mektubu"}),
    ("employment-letter", {"en": "Employment Letter", "de": "Arbeitgeberbescheinigung", "tr": "İşveren Yazısı"}),
    ("travel-insurance", {"en": "Travel Insurance", "de": "Reiseversicherung", "tr": "Seyahat Sigortası"}),
    ("invitation-letter", {"en": "Invitation Letter", "de": "Einladungsschreiben", "tr": "Davetiye"}),
]

EMAIL_TEMPLATES = [
    {
        "code": "application-received",
        "name": "Application Received",
        "trigger": EmailTemplate.Trigger.APPLICATION_SUBMITTED,
        "subject": "We have received your application {{application_id}}",
        "body": (
            "Dear {{customer_name}},\n\n"
            "We have successfully received your visa application.\n\n"
            "Application ID: {{application_id}}\n"
            "Visa: {{visa_type}}\n"
            "Country: {{country}}\n\n"
            "Our team will review your application and contact you if anything "
            "further is required.\n\n"
            "Regards,\n{{company_name}}"
        ),
    },
    {
        "code": "document-required",
        "name": "Additional Document Required",
        "trigger": EmailTemplate.Trigger.DOCUMENT_REQUIRED,
        "subject": "Additional document required for {{application_id}}",
        "body": (
            "Dear {{customer_name}},\n\n"
            "We require an additional document for your application.\n\n"
            "Required document: {{document_name}}\n"
            "Reason: {{reason}}\n\n"
            "Please upload it through your customer portal.\n\n"
            "Regards,\n{{company_name}}"
        ),
    },
    {
        "code": "document-rejected",
        "name": "Document Rejected",
        "trigger": EmailTemplate.Trigger.DOCUMENT_REJECTED,
        "subject": "A document on {{application_id}} needs to be replaced",
        "body": (
            "Dear {{customer_name}},\n\n"
            "The document '{{document_name}}' could not be accepted.\n\n"
            "Reason: {{reason}}\n\n"
            "Please upload a new copy through your customer portal.\n\n"
            "Regards,\n{{company_name}}"
        ),
    },
    {
        "code": "document-verified",
        "name": "Document Verified",
        "trigger": EmailTemplate.Trigger.DOCUMENT_VERIFIED,
        "subject": "Your {{document_name}} has been verified",
        "body": (
            "Dear {{customer_name}},\n\n"
            "Your document '{{document_name}}' has been verified.\n\n"
            "Application ID: {{application_id}}\n\n"
            "Regards,\n{{company_name}}"
        ),
    },
    {
        "code": "application-verified",
        "name": "Application Verified",
        "trigger": EmailTemplate.Trigger.APPLICATION_VERIFIED,
        "subject": "Your application {{application_id}} has been verified",
        "body": (
            "Dear {{customer_name}},\n\n"
            "Your visa application has successfully passed the verification "
            "stage and is now being processed.\n\n"
            "Application ID: {{application_id}}\n\n"
            "Regards,\n{{company_name}}"
        ),
    },
    {
        "code": "application-approved",
        "name": "Application Approved",
        "trigger": EmailTemplate.Trigger.APPLICATION_APPROVED,
        "subject": "Your application {{application_id}} has been approved",
        "body": (
            "Dear {{customer_name}},\n\n"
            "We are pleased to inform you that your application has been approved.\n\n"
            "Application ID: {{application_id}}\n"
            "Visa: {{visa_type}}\n\n"
            "Regards,\n{{company_name}}"
        ),
    },
    {
        "code": "company-new-application",
        "name": "Company: New Application",
        "trigger": EmailTemplate.Trigger.COMPANY_NEW_APPLICATION,
        "subject": "New visa application – {{application_id}}",
        "body": (
            "A new application has been submitted.\n\n"
            "Customer: {{customer_name}}\n"
            "Application: {{application_id}}\n"
            "Visa: {{visa_type}}\n"
            "Country: {{country}}\n"
            "Submitted: {{application_date}}\n"
        ),
    },
]


class Command(BaseCommand):
    help = "Seed reference data (countries, document types, visa types, email templates)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--demo-users",
            action="store_true",
            help="Also create demo staff and customer accounts (development only).",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        countries = {}
        for code, name, flag in COUNTRIES:
            country, _ = Country.objects.update_or_create(
                code=code, defaults={"name": name, "flag_emoji": flag}
            )
            countries[code] = country
        self.stdout.write(f"Countries: {len(countries)}")

        doc_types = {}
        for order, (code, name) in enumerate(DOCUMENT_TYPES):
            doc_type, _ = DocumentType.objects.update_or_create(
                code=code, defaults={"name": name, "display_order": order}
            )
            doc_types[code] = doc_type
        self.stdout.write(f"Document types: {len(doc_types)}")

        student_visa, _ = VisaType.objects.update_or_create(
            slug="germany-student-visa",
            defaults={
                "name": {
                    "en": "Student Visa",
                    "de": "Studentenvisum",
                    "tr": "Öğrenci Vizesi",
                },
                "country": countries["DE"],
                "description": {
                    "en": "For students admitted to a German university.",
                    "de": "Für Studierende mit Zulassung an einer deutschen Hochschule.",
                    "tr": "Bir Alman üniversitesine kabul edilen öğrenciler için.",
                },
                "processing_time": {
                    "en": "4–12 weeks",
                    "de": "4–12 Wochen",
                    "tr": "4–12 hafta",
                },
                "entry_type": VisaType.EntryType.MULTIPLE,
                "fee_amount": "75.00",
                "fee_currency": "EUR",
                "status": VisaType.Status.PUBLISHED,
                "is_featured": True,
            },
        )

        tourist_visa, _ = VisaType.objects.update_or_create(
            slug="turkiye-tourist-visa",
            defaults={
                "name": {
                    "en": "Tourist Visa",
                    "de": "Touristenvisum",
                    "tr": "Turist Vizesi",
                },
                "country": countries["TR"],
                "description": {
                    "en": "Short-stay visa for tourism and family visits.",
                    "de": "Kurzzeitvisum für Tourismus und Familienbesuche.",
                    "tr": "Turizm ve aile ziyaretleri için kısa süreli vize.",
                },
                "processing_time": {
                    "en": "2–4 weeks",
                    "de": "2–4 Wochen",
                    "tr": "2–4 hafta",
                },
                "entry_type": VisaType.EntryType.SINGLE,
                "fee_amount": "60.00",
                "fee_currency": "EUR",
                "status": VisaType.Status.PUBLISHED,
                "is_featured": True,
            },
        )

        required = {
            student_visa: [
                ("passport", True),
                ("passport-photo", True),
                ("admission-letter", True),
                ("bank-statement", True),
                ("travel-insurance", False),
            ],
            tourist_visa: [
                ("passport", True),
                ("passport-photo", True),
                ("invitation-letter", False),
            ],
        }
        for visa, entries in required.items():
            for order, (code, mandatory) in enumerate(entries):
                RequiredDocument.objects.update_or_create(
                    visa_type=visa,
                    document_type=doc_types[code],
                    defaults={"is_mandatory": mandatory, "display_order": order},
                )
        self.stdout.write("Visa types: 2 (with document requirements)")

        for template in EMAIL_TEMPLATES:
            EmailTemplate.objects.update_or_create(
                code=template["code"],
                defaults={
                    "name": template["name"],
                    "trigger": template["trigger"],
                    "subject": template["subject"],
                    "body": template["body"],
                    "is_active": True,
                },
            )
        self.stdout.write(f"Email templates: {len(EMAIL_TEMPLATES)}")

        if options["demo_users"]:
            self._create_demo_users()

        self.stdout.write(self.style.SUCCESS("Seed complete."))

    def _create_demo_users(self):
        from customers.models import CustomerProfile

        accounts = [
            ("admin@visacare.test", User.Role.SUPER_ADMIN, "Amina", "Rahimi"),
            ("officer@visacare.test", User.Role.VISA_OFFICER, "Omar", "Yilmaz"),
            ("cms@visacare.test", User.Role.CMS_MANAGER, "Lena", "Schmidt"),
        ]
        for email, role, first, last in accounts:
            user, created = User.objects.get_or_create(
                email=email,
                defaults={
                    "role": role,
                    "first_name": first,
                    "last_name": last,
                    "is_staff": role == User.Role.SUPER_ADMIN,
                    "is_superuser": role == User.Role.SUPER_ADMIN,
                },
            )
            if created:
                user.set_password("DemoPass2026!")
                user.save()

        customer, created = User.objects.get_or_create(
            email="ahmad@example.test",
            defaults={
                "role": User.Role.CUSTOMER,
                "first_name": "Ahmad",
                "last_name": "Khan",
                "phone": "+93700000000",
            },
        )
        if created:
            customer.set_password("DemoPass2026!")
            customer.save()
        CustomerProfile.objects.get_or_create(
            user=customer,
            defaults={"nationality": "Afghan", "city": "Kabul", "country": "Afghanistan"},
        )

        self.stdout.write(
            self.style.WARNING(
                "Demo accounts created with password 'DemoPass2026!' — "
                "development only."
            )
        )
