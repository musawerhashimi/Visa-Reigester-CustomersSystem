from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import permissions, viewsets

from accounts import permissions as perms

from .models import Country, VisaCategory, VisaType
from .serializers import CountrySerializer, VisaCategorySerializer, VisaTypeSerializer


class PublishedOnlyMixin:
    """Visitors see published records; CMS managers see drafts too.

    The public site and the CMS share these endpoints, so the queryset—not
    the caller—decides what unpublished content is visible.
    """

    def _include_unpublished(self):
        user = self.request.user
        return bool(
            user
            and user.is_authenticated
            and user.has_perm_slug(perms.VISAS_MANAGE)
        )


class CountryViewSet(PublishedOnlyMixin, viewsets.ReadOnlyModelViewSet):
    """Destination countries, readable by anyone."""

    serializer_class = CountrySerializer
    permission_classes = (permissions.AllowAny,)
    pagination_class = None

    def get_queryset(self):
        queryset = Country.objects.all()
        if self._include_unpublished():
            return queryset
        return queryset.filter(is_active=True)


class VisaCategoryViewSet(PublishedOnlyMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = VisaCategorySerializer
    permission_classes = (permissions.AllowAny,)
    pagination_class = None

    def get_queryset(self):
        queryset = VisaCategory.objects.all()
        if self._include_unpublished():
            return queryset
        return queryset.filter(status=VisaCategory.Status.PUBLISHED)


class VisaTypeViewSet(PublishedOnlyMixin, viewsets.ReadOnlyModelViewSet):
    """Visa types for the public site and the customer's application form."""

    serializer_class = VisaTypeSerializer
    permission_classes = (permissions.AllowAny,)
    lookup_field = "slug"
    filter_backends = (DjangoFilterBackend,)
    filterset_fields = ("country", "category", "is_featured")
    search_fields = ("slug",)

    def get_queryset(self):
        queryset = VisaType.objects.select_related("country", "category").prefetch_related(
            "required_documents__document_type"
        )
        if self._include_unpublished():
            return queryset
        return queryset.filter(status=VisaType.Status.PUBLISHED)
