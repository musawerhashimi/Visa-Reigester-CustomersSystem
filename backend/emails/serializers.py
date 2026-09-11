import os

from django.conf import settings
from rest_framework import serializers

from .models import TEMPLATE_VARIABLES, EmailAttachment, EmailLog, EmailTemplate


class EmailTemplateSerializer(serializers.ModelSerializer):
    available_variables = serializers.SerializerMethodField()

    class Meta:
        model = EmailTemplate
        fields = (
            "id",
            "code",
            "name",
            "subject",
            "body",
            "trigger",
            "is_active",
            "available_variables",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "available_variables", "created_at", "updated_at")

    def get_available_variables(self, obj):
        return list(TEMPLATE_VARIABLES)


class EmailAttachmentSerializer(serializers.ModelSerializer):
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = EmailAttachment
        fields = ("id", "original_filename", "size_bytes", "download_url")
        read_only_fields = fields

    def get_download_url(self, obj):
        return f"/api/email-attachments/{obj.pk}/download/"


class EmailLogSerializer(serializers.ModelSerializer):
    attachments = EmailAttachmentSerializer(many=True, read_only=True)
    sent_by_name = serializers.SerializerMethodField()
    template_name = serializers.CharField(source="template.name", read_only=True)
    application_number = serializers.CharField(
        source="application.application_number", read_only=True
    )

    class Meta:
        model = EmailLog
        fields = (
            "id",
            "to_email",
            "cc",
            "subject",
            "body",
            "application",
            "application_number",
            "template_name",
            "sent_by_name",
            "is_automatic",
            "status",
            "sent_at",
            "error_message",
            "attachments",
            "created_at",
        )
        read_only_fields = fields

    def get_sent_by_name(self, obj):
        if obj.sent_by is None:
            return None
        return obj.sent_by.get_full_name() or obj.sent_by.email


class ComposeEmailSerializer(serializers.Serializer):
    """A staff member writing a custom email (section 30)."""

    application = serializers.IntegerField(required=False, allow_null=True)
    to_email = serializers.EmailField()
    cc = serializers.CharField(required=False, allow_blank=True, default="")
    subject = serializers.CharField(max_length=255)
    body = serializers.CharField()
    template = serializers.IntegerField(required=False, allow_null=True)
    # Uploaded alongside the message; also accepts documents already on the
    # application, addressed by id.
    attachments = serializers.ListField(
        child=serializers.FileField(), required=False, default=list
    )
    attach_documents = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list
    )
    attach_receipts = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list
    )
    attach_official_documents = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list
    )

    def validate_subject(self, value):
        if not value.strip():
            raise serializers.ValidationError("A subject is required.")
        return value

    def validate_body(self, value):
        if not value.strip():
            raise serializers.ValidationError("The message cannot be empty.")
        return value

    def validate_cc(self, value):
        """Accept a comma-separated list, rejecting anything unparseable."""
        if not value.strip():
            return ""
        addresses = [item.strip() for item in value.split(",") if item.strip()]
        validator = serializers.EmailField()
        for address in addresses:
            validator.run_validation(address)
        return ",".join(addresses)

    def validate_attachments(self, value):
        max_size = getattr(settings, "MAX_UPLOAD_SIZE_BYTES", 10 * 1024 * 1024)
        allowed = getattr(settings, "ALLOWED_UPLOAD_EXTENSIONS", ())

        total = 0
        for uploaded in value:
            total += uploaded.size
            if uploaded.size > max_size:
                limit = max_size / (1024 * 1024)
                raise serializers.ValidationError(
                    f"'{uploaded.name}' is larger than the {limit:.0f} MB limit."
                )
            extension = os.path.splitext(uploaded.name)[1].lower()
            if allowed and extension not in allowed:
                raise serializers.ValidationError(
                    f"Unsupported file type '{extension}'. Allowed: {', '.join(allowed)}."
                )

        # Mail servers commonly reject messages over ~25 MB outright, so the
        # combined size is capped rather than only each file.
        if total > max_size * 2:
            raise serializers.ValidationError(
                "The attachments are too large to send in one email."
            )
        return value


class PreviewTemplateSerializer(serializers.Serializer):
    """Render a template against a real application before sending."""

    template = serializers.IntegerField()
    application = serializers.IntegerField(required=False, allow_null=True)
