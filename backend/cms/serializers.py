from rest_framework import serializers

from core.i18n import LANGUAGES, translate

from .models import (
    Activity,
    Banner,
    CompanyInfo,
    ContactMessage,
    Event,
    FAQ,
    GalleryItem,
    News,
    Page,
    Service,
    TeamMember,
    Testimonial,
)


class TranslatedFieldMixin:
    """Validate every translatable field the same way.

    English is the fallback the public site falls back to, so a record cannot
    be published without it; German and Turkish may lag behind while the CMS
    catches up.
    """

    translated_fields: tuple[str, ...] = ()
    #: Translated fields that must carry English before publishing.
    required_english: tuple[str, ...] = ()

    def validate(self, attrs):
        attrs = super().validate(attrs)

        for field in self.translated_fields:
            if field not in attrs:
                continue
            value = attrs[field]
            if not isinstance(value, dict):
                raise serializers.ValidationError(
                    {field: "Provide an object with 'en', 'de' and 'tr' keys."}
                )
            unknown = set(value) - set(LANGUAGES)
            if unknown:
                raise serializers.ValidationError(
                    {field: f"Unsupported language(s): {', '.join(sorted(unknown))}."}
                )
            for language, text in value.items():
                if not isinstance(text, str):
                    raise serializers.ValidationError(
                        {field: f"The '{language}' translation must be text."}
                    )
            # Normalise so a partially filled form still stores all three keys.
            attrs[field] = {language: value.get(language, "") for language in LANGUAGES}

        status = attrs.get("status", getattr(self.instance, "status", None))
        if status == "published":
            for field in self.required_english:
                value = attrs.get(field, getattr(self.instance, field, None))
                if not translate(value):
                    raise serializers.ValidationError(
                        {field: "An English version is required before publishing."}
                    )
        return attrs


class TranslationStatusMixin:
    """Expose which languages are still missing, so editors can see the gaps."""

    def get_missing_translations(self, obj):
        missing = []
        for field in self.translated_fields:
            value = getattr(obj, field, None)
            if not isinstance(value, dict):
                continue
            # A field left entirely blank is not "missing a translation" —
            # it is simply unused, and flagging it would be noise.
            if not any(value.get(language) for language in LANGUAGES):
                continue
            for language in LANGUAGES:
                if not value.get(language) and language not in missing:
                    missing.append(language)
        return missing


class CompanyInfoSerializer(TranslatedFieldMixin, serializers.ModelSerializer):
    translated_fields = (
        "name",
        "description",
        "mission",
        "vision",
        "goals",
        "history",
        "values",
        "working_hours",
    )
    required_english = ("name",)

    #: Accepted but never returned. Sending the stored password back to the
    #: browser would undo the point of encrypting it.
    smtp_password = serializers.CharField(
        write_only=True, required=False, allow_blank=True, style={"input_type": "password"}
    )
    #: Lets the form show "set" without revealing anything.
    smtp_password_set = serializers.SerializerMethodField()

    def get_smtp_password_set(self, obj):
        return bool(obj.smtp_password_encrypted)

    def update(self, instance, validated_data):
        # An omitted password keeps the stored one; an explicit "" clears it.
        password = validated_data.pop("smtp_password", None)
        instance = super().update(instance, validated_data)
        if password is not None:
            instance.set_smtp_password(password)
            instance.save(update_fields=["smtp_password_encrypted", "updated_at"])
        return instance

    def validate(self, attrs):
        attrs = super().validate(attrs)

        # Turning delivery on with no host would fail silently on every send.
        enabled = attrs.get("smtp_enabled", getattr(self.instance, "smtp_enabled", False))
        if enabled:
            host = attrs.get("smtp_host", getattr(self.instance, "smtp_host", ""))
            if not host:
                raise serializers.ValidationError(
                    {"smtp_host": "A mail server is required to send email."}
                )
        return attrs

    class Meta:
        model = CompanyInfo
        fields = (
            "name",
            "description",
            "about_image",
            "mission",
            "vision",
            "goals",
            "history",
            "values",
            "working_hours",
            "logo",
            "address",
            "phone",
            "email",
            "sending_email",
            "smtp_host",
            "smtp_port",
            "smtp_username",
            "smtp_password",
            "smtp_password_set",
            "smtp_use_tls",
            "smtp_enabled",
            "website",
            "social_links",
            "updated_at",
        )
        read_only_fields = ("updated_at", "smtp_password_set")


class BaseContentSerializer(
    TranslationStatusMixin, TranslatedFieldMixin, serializers.ModelSerializer
):
    missing_translations = serializers.SerializerMethodField()

    class Meta:
        read_only_fields = ("id", "created_at", "updated_at", "missing_translations")


class ServiceSerializer(BaseContentSerializer):
    translated_fields = (
        "name",
        "description",
        "requirements",
        "processing_info",
        "estimated_time",
        "fee_info",
    )
    required_english = ("name",)

    class Meta(BaseContentSerializer.Meta):
        model = Service
        fields = (
            "id",
            "slug",
            "name",
            "description",
            "requirements",
            "processing_info",
            "estimated_time",
            "fee_info",
            "image",
            "is_featured",
            "status",
            "published_at",
            "display_order",
            "missing_translations",
            "created_at",
            "updated_at",
        )


class ActivitySerializer(BaseContentSerializer):
    translated_fields = (
        "title",
        "short_description",
        "full_description",
        "location",
    )
    required_english = ("title",)

    class Meta(BaseContentSerializer.Meta):
        model = Activity
        fields = (
            "id",
            "slug",
            "title",
            "short_description",
            "full_description",
            "cover_image",
            "date",
            "location",
            "category",
            "status",
            "published_at",
            "display_order",
            "missing_translations",
            "created_at",
            "updated_at",
        )


class NewsSerializer(BaseContentSerializer):
    translated_fields = ("title", "short_description", "content")
    required_english = ("title",)

    class Meta(BaseContentSerializer.Meta):
        model = News
        fields = (
            "id",
            "slug",
            "title",
            "short_description",
            "content",
            "featured_image",
            "author",
            "category",
            "views",
            "status",
            "published_at",
            "display_order",
            "missing_translations",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "views",
            "created_at",
            "updated_at",
            "missing_translations",
        )


class EventSerializer(BaseContentSerializer):
    translated_fields = ("title", "description", "location", "registration_info")
    required_english = ("title",)

    class Meta(BaseContentSerializer.Meta):
        model = Event
        fields = (
            "id",
            "slug",
            "title",
            "description",
            "start_date",
            "end_date",
            "location",
            "image",
            "registration_info",
            "status",
            "published_at",
            "display_order",
            "missing_translations",
            "created_at",
            "updated_at",
        )

    def validate(self, attrs):
        attrs = super().validate(attrs)
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start and end and end < start:
            raise serializers.ValidationError(
                {"end_date": "An event cannot end before it starts."}
            )
        return attrs


class GalleryItemSerializer(BaseContentSerializer):
    translated_fields = ("title", "description")

    #: Whether the site should render this as a photo or a video.
    kind = serializers.CharField(read_only=True)

    class Meta(BaseContentSerializer.Meta):
        model = GalleryItem
        fields = (
            "id",
            "title",
            "description",
            "image",
            "video",
            "video_url",
            "kind",
            "category",
            "is_featured",
            "status",
            "published_at",
            "display_order",
            "missing_translations",
            "created_at",
            "updated_at",
        )

    def validate(self, attrs):
        attrs = super().validate(attrs)

        def value(name):
            if name in attrs:
                return attrs[name]
            return getattr(self.instance, name, None)

        # An entry with no photo, no upload and no link would render as an
        # empty tile on the public gallery.
        if not (value("image") or value("video") or value("video_url")):
            raise serializers.ValidationError(
                {"image": "Add a photo, a video file, or a video link."}
            )

        # An uploaded file and an embedded link are two different videos, and
        # `kind` cannot say which one the tile should play.
        if value("video") and value("video_url"):
            raise serializers.ValidationError(
                {
                    "video": (
                        "Use either a video file or a video link, not both."
                    )
                }
            )
        return attrs


class FAQSerializer(BaseContentSerializer):
    translated_fields = ("question", "answer")
    required_english = ("question", "answer")

    class Meta(BaseContentSerializer.Meta):
        model = FAQ
        fields = (
            "id",
            "question",
            "answer",
            "category",
            "status",
            "published_at",
            "display_order",
            "missing_translations",
            "created_at",
            "updated_at",
        )


class TestimonialSerializer(BaseContentSerializer):
    translated_fields = ("content", "role")
    required_english = ("content",)

    class Meta(BaseContentSerializer.Meta):
        model = Testimonial
        fields = (
            "id",
            "customer_name",
            "content",
            "role",
            "photo",
            "rating",
            "status",
            "published_at",
            "display_order",
            "missing_translations",
            "created_at",
            "updated_at",
        )


class BannerSerializer(BaseContentSerializer):
    translated_fields = ("title", "subtitle", "cta_label")

    class Meta(BaseContentSerializer.Meta):
        model = Banner
        fields = (
            "id",
            "title",
            "subtitle",
            "image",
            "cta_label",
            "cta_url",
            "status",
            "published_at",
            "display_order",
            "missing_translations",
            "created_at",
            "updated_at",
        )


class TeamMemberSerializer(BaseContentSerializer):
    translated_fields = ("position", "bio")

    class Meta(BaseContentSerializer.Meta):
        model = TeamMember
        fields = (
            "id",
            "name",
            "position",
            "bio",
            "photo",
            "social_links",
            "status",
            "published_at",
            "display_order",
            "missing_translations",
            "created_at",
            "updated_at",
        )


class PageSerializer(BaseContentSerializer):
    translated_fields = ("title", "content", "meta_description")
    required_english = ("title",)

    class Meta(BaseContentSerializer.Meta):
        model = Page
        fields = (
            "id",
            "slug",
            "title",
            "content",
            "meta_description",
            "status",
            "published_at",
            "display_order",
            "missing_translations",
            "created_at",
            "updated_at",
        )


class ContactMessageSerializer(serializers.ModelSerializer):
    """Read side for the MIS inbox."""

    class Meta:
        model = ContactMessage
        fields = (
            "id",
            "name",
            "email",
            "phone",
            "subject",
            "message",
            "status",
            "reply_body",
            "replied_at",
            "created_at",
        )
        read_only_fields = fields


class ContactMessageCreateSerializer(serializers.ModelSerializer):
    """Public contact form submission."""

    class Meta:
        model = ContactMessage
        fields = ("name", "email", "phone", "subject", "message")


class ContactReplySerializer(serializers.Serializer):
    body = serializers.CharField()
