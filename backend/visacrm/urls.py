from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.routers import DefaultRouter

from accounts.staff_views import StaffListView
from applications.views import ApplicationViewSet
from customers.views import InternalNoteViewSet
from documents.type_views import DocumentTypeListView
from documents.views import ApplicationDocumentView, DocumentViewSet
from cms.views import (
    ActivityViewSet,
    BannerViewSet,
    CompanyInfoView,
    ContactMessageViewSet,
    EventViewSet,
    FAQViewSet,
    GalleryViewSet,
    NewsViewSet,
    PageViewSet,
    ServiceViewSet,
    TeamMemberViewSet,
    TestimonialViewSet,
)
from emails.views import (
    EmailAttachmentDownloadView,
    EmailLogViewSet,
    EmailTemplateViewSet,
)
from notifications.views import NotificationViewSet
from reports.views import ReportViewSet
from payments.views import (
    OfficialDocumentViewSet,
    PaymentViewSet,
    ReceiptViewSet,
)
from visas.views import CountryViewSet, VisaCategoryViewSet, VisaTypeViewSet

router = DefaultRouter()
router.register("countries", CountryViewSet, basename="country")
router.register("visa-categories", VisaCategoryViewSet, basename="visa-category")
router.register("visa-types", VisaTypeViewSet, basename="visa-type")
router.register("cms/services", ServiceViewSet, basename="cms-service")
router.register("cms/activities", ActivityViewSet, basename="cms-activity")
router.register("cms/news", NewsViewSet, basename="cms-news")
router.register("cms/events", EventViewSet, basename="cms-event")
router.register("cms/gallery", GalleryViewSet, basename="cms-gallery")
router.register("cms/faqs", FAQViewSet, basename="cms-faq")
router.register("cms/testimonials", TestimonialViewSet, basename="cms-testimonial")
router.register("cms/banners", BannerViewSet, basename="cms-banner")
router.register("cms/team", TeamMemberViewSet, basename="cms-team")
router.register("cms/pages", PageViewSet, basename="cms-page")
router.register("cms/contact-messages", ContactMessageViewSet, basename="cms-contact")
router.register("applications", ApplicationViewSet, basename="application")
router.register("documents", DocumentViewSet, basename="document")
router.register("notifications", NotificationViewSet, basename="notification")
router.register("internal-notes", InternalNoteViewSet, basename="internal-note")
router.register("emails", EmailLogViewSet, basename="email")
router.register("email-templates", EmailTemplateViewSet, basename="email-template")
router.register(
    "email-attachments", EmailAttachmentDownloadView, basename="email-attachment"
)
router.register("reports", ReportViewSet, basename="report")
router.register("payments", PaymentViewSet, basename="payment")
router.register("receipts", ReceiptViewSet, basename="receipt")
router.register(
    "official-documents", OfficialDocumentViewSet, basename="official-document"
)

# Uploads are addressed through their application, which is what the
# permission check keys off.
application_documents = ApplicationDocumentView.as_view({"post": "create"})
application_document_request = ApplicationDocumentView.as_view(
    {"post": "request_document"}
)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("accounts.urls")),
    path("api/", include(router.urls)),
    path(
        "api/applications/<int:application_pk>/documents/",
        application_documents,
        name="application-documents",
    ),
    path(
        "api/applications/<int:application_pk>/documents/request/",
        application_document_request,
        name="application-document-request",
    ),
    path("api/cms/company/", CompanyInfoView.as_view(), name="cms-company"),
    path("api/staff/", StaffListView.as_view(), name="staff-list"),
    path("api/document-types/", DocumentTypeListView.as_view(), name="document-types"),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
