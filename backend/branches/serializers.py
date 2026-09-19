from rest_framework import serializers

from .models import Branch


class BranchSerializer(serializers.ModelSerializer):
    application_count = serializers.IntegerField(read_only=True)
    staff_count = serializers.IntegerField(read_only=True)

    #: Accepted but never returned. Sending the stored password back to the
    #: browser would undo the point of encrypting it.
    smtp_password = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        style={"input_type": "password"},
    )
    #: Lets the form show "set" without revealing anything.
    smtp_password_set = serializers.SerializerMethodField()

    class Meta:
        model = Branch
        fields = (
            "id",
            "name",
            "code",
            "is_general",
            "city",
            "country",
            "address",
            "phone",
            "email",
            "is_active",
            "sending_email",
            "smtp_host",
            "smtp_port",
            "smtp_username",
            "smtp_password",
            "smtp_password_set",
            "smtp_use_tls",
            "smtp_enabled",
            "application_count",
            "staff_count",
            "created_at",
        )
        # The general branch is established by migration; nothing may create a
        # second one or promote itself into that position through the API.
        read_only_fields = ("is_general", "smtp_password_set")

    def get_smtp_password_set(self, obj):
        return bool(obj.smtp_password_encrypted)

    def validate_code(self, value):
        return value.strip().upper()

    def validate(self, attrs):
        # Turning delivery on with no host would fail silently on every send.
        enabled = attrs.get(
            "smtp_enabled", getattr(self.instance, "smtp_enabled", False)
        )
        if enabled:
            host = attrs.get("smtp_host", getattr(self.instance, "smtp_host", ""))
            if not host:
                raise serializers.ValidationError(
                    {"smtp_host": "A mail server is required to send email."}
                )
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("smtp_password", None)
        branch = super().create(validated_data)
        if password:
            branch.set_smtp_password(password)
            branch.save(update_fields=["smtp_password_encrypted", "updated_at"])
        return branch

    def update(self, instance, validated_data):
        # An omitted password keeps the stored one; an explicit "" clears it.
        password = validated_data.pop("smtp_password", None)
        instance = super().update(instance, validated_data)
        if password is not None:
            instance.set_smtp_password(password)
            instance.save(update_fields=["smtp_password_encrypted", "updated_at"])
        return instance


class BranchBriefSerializer(serializers.ModelSerializer):
    """Branch identity as nested inside applications and user rows."""

    class Meta:
        model = Branch
        fields = ("id", "name", "code", "is_general")


class PublicBranchSerializer(serializers.ModelSerializer):
    """What an applicant sees when choosing where to apply."""

    class Meta:
        model = Branch
        fields = ("id", "name", "code", "city", "country", "address", "phone")
