from django.db import models
from django.http import FileResponse, Http404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts import permissions as perms
from applications.models import Application

from . import services
from .models import Document
from .serializers import (
    DocumentRejectSerializer,
    DocumentRequestCreateSerializer,
    DocumentRequestSerializer,
    DocumentSerializer,
    DocumentUploadSerializer,
)


class DocumentViewSet(viewsets.ReadOnlyModelViewSet):
    """Reading, uploading and reviewing documents.

    Uploads are nested under an application because a document has no meaning
    without one; review actions are flat because staff act on a document id.
    """

    serializer_class = DocumentSerializer
    # Review actions post JSON; uploads go to ApplicationDocumentView.
    parser_classes = (JSONParser, MultiPartParser, FormParser)

    def get_queryset(self):
        user = self.request.user
        queryset = Document.objects.select_related(
            "document_type", "application__customer__user", "verified_by"
        )

        if user.is_customer:
            return queryset.filter(application__customer__user=user)
        if user.has_perm_slug(perms.APPLICATIONS_VIEW):
            return queryset
        if user.has_perm_slug(perms.DOCUMENTS_VIEW):
            # Own workload plus unclaimed applications, matching what an
            # officer can open in the application list.
            return queryset.filter(
                models.Q(application__assigned_to=user)
                | models.Q(application__assigned_to__isnull=True)
            )
        return queryset.none()

    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        """Serve a file only after checking who is asking (section 61)."""
        document = self.get_object()
        if not document.is_accessible_by(request.user):
            raise PermissionDenied("You are not authorised to access this document.")

        try:
            handle = document.file.open("rb")
        except FileNotFoundError as error:
            raise Http404("The stored file is missing.") from error

        return FileResponse(
            handle,
            as_attachment=True,
            filename=document.original_filename or document.file.name.split("/")[-1],
        )

    @action(detail=True, methods=["post"])
    def verify(self, request, pk=None):
        if not request.user.has_perm_slug(perms.DOCUMENTS_VERIFY):
            raise PermissionDenied("You cannot verify documents.")

        document = self.get_object()
        services.verify(document, actor=request.user, request=request)
        return Response(self.get_serializer(document).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        if not request.user.has_perm_slug(perms.DOCUMENTS_REJECT):
            raise PermissionDenied("You cannot reject documents.")

        document = self.get_object()
        serializer = DocumentRejectSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            services.reject(
                document,
                reason=serializer.validated_data["reason"],
                actor=request.user,
                request=request,
            )
        except services.DocumentError as error:
            return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(self.get_serializer(document).data)


class ApplicationDocumentView(viewsets.ViewSet):
    """Uploading to, and requesting documents for, one application."""

    parser_classes = (MultiPartParser, FormParser)

    def _get_application(self, request, application_pk):
        queryset = Application.objects.alive().select_related("customer__user")
        application = queryset.filter(pk=application_pk).first()
        if application is None:
            raise Http404("Application not found.")

        user = request.user
        if user.is_customer:
            if application.customer.user_id != user.id:
                raise PermissionDenied("This is not your application.")
        elif not (
            user.has_perm_slug(perms.APPLICATIONS_VIEW)
            or application.assigned_to_id == user.id
        ):
            raise PermissionDenied("You cannot access this application.")
        return application

    def create(self, request, application_pk=None):
        """Customer (or staff on their behalf) uploads a document."""
        application = self._get_application(request, application_pk)

        if request.user.is_customer and application.is_terminal:
            raise PermissionDenied(
                "This application is closed and no longer accepts uploads."
            )

        serializer = DocumentUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        document = services.upload(
            application,
            document_type=serializer.validated_data["document_type"],
            uploaded_file=serializer.validated_data["file"],
            actor=request.user,
            request=request,
        )
        return Response(
            DocumentSerializer(document, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["post"], url_path="request")
    def request_document(self, request, application_pk=None):
        if not request.user.has_perm_slug(perms.DOCUMENTS_REQUEST):
            raise PermissionDenied("You cannot request documents.")

        application = self._get_application(request, application_pk)
        serializer = DocumentRequestCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        entry = services.request_document(
            application,
            document_type=serializer.validated_data["document_type"],
            message=serializer.validated_data.get("message", ""),
            actor=request.user,
            request=request,
        )
        return Response(
            DocumentRequestSerializer(entry).data, status=status.HTTP_201_CREATED
        )
