import os
from decimal import Decimal

from django.conf import settings
from rest_framework import serializers

from .models import OfficialDocument, Payment, Receipt


class ReceiptSerializer(serializers.ModelSerializer):
    download_url = serializers.SerializerMethodField()
    # Whether this is a request for money or proof of it, so the portal can
    # label it without re-deriving the rule.
    is_bill = serializers.BooleanField(read_only=True)

    class Meta:
        model = Receipt
        fields = (
            "id",
            "receipt_number",
            "application",
            "download_url",
            "is_available_to_customer",
            "is_bill",
            "created_at",
        )
        read_only_fields = fields

    def get_download_url(self, obj):
        # Always the permission-checked view, never the raw media path.
        return f"/api/receipts/{obj.pk}/download/"


class PaymentSerializer(serializers.ModelSerializer):
    receipt = ReceiptSerializer(read_only=True)
    recorded_by_name = serializers.SerializerMethodField()
    application_number = serializers.CharField(
        source="application.application_number", read_only=True
    )
    customer_name = serializers.SerializerMethodField()
    kind_label = serializers.CharField(source="get_kind_display", read_only=True)

    class Meta:
        model = Payment
        fields = (
            "id",
            "application",
            "application_number",
            "customer_name",
            "amount",
            "currency",
            "method",
            "status",
            "kind",
            "kind_label",
            "card_number",
            "card_owner_name",
            "paid_at",
            "reference",
            "note",
            "recorded_by_name",
            "receipt",
            "created_at",
        )
        read_only_fields = (
            "id",
            "receipt",
            "recorded_by_name",
            "kind_label",
            "created_at",
        )

    def get_recorded_by_name(self, obj):
        """Internal detail: who took the money is not shown to the customer."""
        request = self.context.get("request")
        if request and request.user.is_customer:
            return None
        if obj.recorded_by is None:
            return None
        return obj.recorded_by.get_full_name() or obj.recorded_by.email

    def get_customer_name(self, obj):
        user = obj.customer.user
        return user.get_full_name() or user.email


class BillFeeSerializer(serializers.Serializer):
    """Staff billing a customer for one of the two fees."""

    application = serializers.IntegerField()
    kind = serializers.ChoiceField(
        choices=[
            (Payment.Kind.REGISTRATION, "Registration Fee"),
            (Payment.Kind.VISA_FEE, "Visa Processing Fee"),
        ]
    )
    amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.01")
    )
    currency = serializers.CharField(max_length=3, default="EUR")
    card_number = serializers.CharField(max_length=64)
    card_owner_name = serializers.CharField(
        max_length=120, required=False, allow_blank=True, default=""
    )
    note = serializers.CharField(required=False, allow_blank=True, default="")


class OfficialDocumentSerializer(serializers.ModelSerializer):
    download_url = serializers.SerializerMethodField()
    filename = serializers.SerializerMethodField()
    generated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = OfficialDocument
        fields = (
            "id",
            "application",
            "kind",
            "title",
            "download_url",
            "filename",
            "generated_by_name",
            "is_available_to_customer",
            "created_at",
        )
        read_only_fields = fields

    def get_download_url(self, obj):
        return f"/api/official-documents/{obj.pk}/download/"

    def get_filename(self, obj):
        """What the file should be saved as.

        An attached document may be a scan rather than a PDF, so the real
        stored name is the only thing that gets the extension right.
        """
        if not obj.pdf:
            return ""
        return obj.pdf.name.split("/")[-1]

    def get_generated_by_name(self, obj):
        request = self.context.get("request")
        if request and request.user.is_customer:
            return None
        if obj.generated_by is None:
            return None
        return obj.generated_by.get_full_name() or obj.generated_by.email


class IssueDocumentSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=OfficialDocument.Kind.choices)
    title = serializers.CharField(required=False, allow_blank=True, default="")
    release_to_customer = serializers.BooleanField(default=True)
    send_email = serializers.BooleanField(default=True)
    #: The real visa, OIC or authority letter. Without one the system falls
    #: back to generating its own letter from the application's data.
    file = serializers.FileField(required=False, allow_null=True)

    def validate_file(self, value):
        if value is None:
            return value

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
