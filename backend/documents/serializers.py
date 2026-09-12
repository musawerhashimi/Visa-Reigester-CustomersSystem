import os

from django.conf import settings
from rest_framework import serializers

from .models import Document, DocumentRequest, DocumentType


class DocumentTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentType
        fields = ("id", "code", "name", "description")


class DocumentSerializer(serializers.ModelSerializer):
    document_type = DocumentTypeSerializer(read_only=True)
    verified_by_name = serializers.SerializerMethodField()
    download_url = serializers.SerializerMethodField()
    application_number = serializers.CharField(
        source="application.application_number", read_only=True
    )
    customer_name = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = (
            "id",
            "application",
            "application_number",
            "customer_name",
            "document_type",
            "original_filename",
            "content_type",
            "size_bytes",
            "status",
            "rejection_reason",
            "verified_at",
            "verified_by_name",
            "download_url",
            "created_at",
        )

    def get_customer_name(self, obj):
        """Staff-only: a customer already knows whose application this is."""
        request = self.context.get("request")
        if request and request.user.is_customer:
            return None
        user = obj.application.customer.user
        return user.get_full_name() or user.email

    def get_verified_by_name(self, obj):
        """Hidden from customers: who reviewed a file is internal detail."""
        request = self.context.get("request")
        if request and request.user.is_customer:
            return None
        if obj.verified_by is None:
            return None
        return obj.verified_by.get_full_name() or obj.verified_by.email

    def get_download_url(self, obj):
        # Always the permission-checked view, never the raw media path.
        return f"/api/documents/{obj.pk}/download/"


class DocumentUploadSerializer(serializers.Serializer):
    document_type_id = serializers.PrimaryKeyRelatedField(
        queryset=DocumentType.objects.filter(is_active=True), source="document_type"
    )
    file = serializers.FileField()

    def validate_file(self, value):
        max_size = getattr(settings, "MAX_UPLOAD_SIZE_BYTES", 10 * 1024 * 1024)
        if value.size > max_size:
            limit_mb = max_size / (1024 * 1024)
            raise serializers.ValidationError(
                f"File is too large. The maximum size is {limit_mb:.0f} MB."
            )

        allowed = getattr(settings, "ALLOWED_UPLOAD_EXTENSIONS", ())
        extension = os.path.splitext(value.name)[1].lower()
        if allowed and extension not in allowed:
            raise serializers.ValidationError(
                f"Unsupported file type '{extension}'. Allowed: {', '.join(allowed)}."
            )
        return value


class DocumentRejectSerializer(serializers.Serializer):
    reason = serializers.CharField(allow_blank=False)


class DocumentRequestSerializer(serializers.ModelSerializer):
    document_type = DocumentTypeSerializer(read_only=True)

    class Meta:
        model = DocumentRequest
        fields = (
            "id",
            "application",
            "document_type",
            "message",
            "status",
            "created_at",
            "fulfilled_at",
        )
        read_only_fields = fields


class DocumentRequestCreateSerializer(serializers.Serializer):
    document_type_id = serializers.PrimaryKeyRelatedField(
        queryset=DocumentType.objects.filter(is_active=True), source="document_type"
    )
    message = serializers.CharField(allow_blank=True, default="")
