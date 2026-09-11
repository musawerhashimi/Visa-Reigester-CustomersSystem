from decimal import Decimal

from rest_framework import serializers

from .models import OfficialDocument, Payment, Receipt


class ReceiptSerializer(serializers.ModelSerializer):
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = Receipt
        fields = (
            "id",
            "receipt_number",
            "application",
            "download_url",
            "is_available_to_customer",
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
            "paid_at",
            "reference",
            "note",
            "recorded_by_name",
            "receipt",
            "created_at",
        )
        read_only_fields = ("id", "receipt", "recorded_by_name", "created_at")

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


class RecordPaymentSerializer(serializers.Serializer):
    """Staff recording a payment the customer made offline."""

    application = serializers.IntegerField()
    amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal("0.01")
    )
    currency = serializers.CharField(max_length=3, default="EUR")
    method = serializers.ChoiceField(
        choices=Payment.Method.choices, default=Payment.Method.CASH
    )
    status = serializers.ChoiceField(
        choices=Payment.Status.choices, default=Payment.Status.PAID
    )
    paid_at = serializers.DateTimeField(required=False)
    reference = serializers.CharField(required=False, allow_blank=True, default="")
    note = serializers.CharField(required=False, allow_blank=True, default="")
    issue_receipt = serializers.BooleanField(default=True)


class OfficialDocumentSerializer(serializers.ModelSerializer):
    download_url = serializers.SerializerMethodField()
    generated_by_name = serializers.SerializerMethodField()

    class Meta:
        model = OfficialDocument
        fields = (
            "id",
            "application",
            "kind",
            "title",
            "download_url",
            "generated_by_name",
            "is_available_to_customer",
            "created_at",
        )
        read_only_fields = fields

    def get_download_url(self, obj):
        return f"/api/official-documents/{obj.pk}/download/"

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
