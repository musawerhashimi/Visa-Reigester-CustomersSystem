from rest_framework import serializers

from .models import Branch


class BranchSerializer(serializers.ModelSerializer):
    application_count = serializers.IntegerField(read_only=True)
    staff_count = serializers.IntegerField(read_only=True)

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
            "application_count",
            "staff_count",
            "created_at",
        )
        # The general branch is established by migration; nothing may create a
        # second one or promote itself into that position through the API.
        read_only_fields = ("is_general",)

    def validate_code(self, value):
        return value.strip().upper()


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
