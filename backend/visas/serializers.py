from rest_framework import serializers

from .models import Country, RequiredDocument, VisaCategory, VisaType


class CountrySerializer(serializers.ModelSerializer):
    class Meta:
        model = Country
        fields = ("id", "code", "name", "flag_emoji")


class VisaCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = VisaCategory
        fields = ("id", "slug", "name", "description")


class RequiredDocumentSerializer(serializers.ModelSerializer):
    document_type = serializers.SerializerMethodField()

    class Meta:
        model = RequiredDocument
        fields = ("id", "document_type", "is_mandatory", "notes", "display_order")

    def get_document_type(self, obj):
        return {
            "id": obj.document_type_id,
            "code": obj.document_type.code,
            "name": obj.document_type.name,
        }


class VisaTypeBriefSerializer(serializers.ModelSerializer):
    """Nested inside applications, where only the label is needed."""

    country = CountrySerializer(read_only=True)

    class Meta:
        model = VisaType
        fields = ("id", "slug", "name", "country")


class VisaTypeSerializer(serializers.ModelSerializer):
    country = CountrySerializer(read_only=True)
    category = VisaCategorySerializer(read_only=True)
    required_documents = RequiredDocumentSerializer(many=True, read_only=True)

    class Meta:
        model = VisaType
        fields = (
            "id",
            "slug",
            "name",
            "country",
            "category",
            "description",
            "requirements",
            "application_instructions",
            "processing_time",
            "validity",
            "entry_type",
            "fee_amount",
            "fee_currency",
            "image",
            "is_featured",
            "required_documents",
        )
