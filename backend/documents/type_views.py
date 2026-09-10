"""Document type reference list, used by upload and request pickers."""

from rest_framework import generics, permissions

from .models import DocumentType
from .serializers import DocumentTypeSerializer


class DocumentTypeListView(generics.ListAPIView):
    """Active document types. Read-only reference data for any signed-in user."""

    serializer_class = DocumentTypeSerializer
    permission_classes = (permissions.IsAuthenticated,)
    pagination_class = None
    queryset = DocumentType.objects.filter(is_active=True)
