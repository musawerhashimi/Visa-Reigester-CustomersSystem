from rest_framework import serializers

from cms.serializers import TranslatedFieldMixin, TranslationStatusMixin

from .models import Country, RequiredDocument, VisaCategory, VisaType


class CountrySerializer(TranslatedFieldMixin, serializers.ModelSerializer):
    translated_fields = ("name",)

    class Meta:
        model = Country
        fields = ("id", "code", "name", "flag_emoji", "is_active")

    def validate_code(self, value):
        # ISO 3166-1 alpha-2, stored upper case so the public site and the
        # MIS never disagree about "de" versus "DE".
        return value.strip().upper()

    def validate_name(self, value):
        if isinstance(value, dict) and not (value.get("en") or "").strip():
            raise serializers.ValidationError("An English name is required.")
        return value


class VisaCategorySerializer(TranslatedFieldMixin, serializers.ModelSerializer):
    translated_fields = ("name", "description")
    required_english = ("name",)

    class Meta:
        model = VisaCategory
        fields = (
            "id",
            "slug",
            "name",
            "description",
            "status",
            "display_order",
        )


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


class RequiredDocumentWriteSerializer(serializers.ModelSerializer):
    """Editing one line of a visa type's document checklist."""

    class Meta:
        model = RequiredDocument
        fields = (
            "id",
            "visa_type",
            "document_type",
            "is_mandatory",
            "notes",
            "display_order",
        )


class VisaTypeBriefSerializer(serializers.ModelSerializer):
    """Nested inside applications, where only the label is needed."""

    country = CountrySerializer(read_only=True)

    class Meta:
        model = VisaType
        fields = ("id", "slug", "name", "country")


class VisaTypeSerializer(
    TranslatedFieldMixin, TranslationStatusMixin, serializers.ModelSerializer
):
    """Read nests country and category; writes take their ids.

    The public site and the applicant's form want the whole country object,
    while the MIS editor posts a picked id — so the nested fields stay
    read-only and `*_id` carries the write.
    """

    translated_fields = (
        "name",
        "description",
        "requirements",
        "application_instructions",
        "processing_time",
        "validity",
    )
    required_english = ("name",)

    country = CountrySerializer(read_only=True)
    country_id = serializers.PrimaryKeyRelatedField(
        source="country", queryset=Country.objects.all(), write_only=True
    )
    category = VisaCategorySerializer(read_only=True)
    category_id = serializers.PrimaryKeyRelatedField(
        source="category",
        queryset=VisaCategory.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )
    required_documents = RequiredDocumentSerializer(many=True, read_only=True)
    missing_translations = serializers.SerializerMethodField()

    class Meta:
        model = VisaType
        fields = (
            "id",
            "slug",
            "name",
            "country",
            "country_id",
            "category",
            "category_id",
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
            "status",
            "display_order",
            "required_documents",
            "missing_translations",
        )
