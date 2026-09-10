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
from notifications.views import NotificationViewSet
from visas.views import CountryViewSet, VisaCategoryViewSet, VisaTypeViewSet

router = DefaultRouter()
router.register("countries", CountryViewSet, basename="country")
router.register("visa-categories", VisaCategoryViewSet, basename="visa-category")
router.register("visa-types", VisaTypeViewSet, basename="visa-type")
router.register("applications", ApplicationViewSet, basename="application")
router.register("documents", DocumentViewSet, basename="document")
router.register("notifications", NotificationViewSet, basename="notification")
router.register("internal-notes", InternalNoteViewSet, basename="internal-note")

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
