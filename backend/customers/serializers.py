from rest_framework import serializers

from .models import CustomerProfile, InternalNote


class InternalNoteSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()

    class Meta:
        model = InternalNote
        fields = ("id", "application", "body", "author_name", "created_at")
        read_only_fields = ("id", "author_name", "created_at")
        extra_kwargs = {"application": {"required": False}}

    def get_author_name(self, obj):
        if obj.author is None:
            return None
        return obj.author.get_full_name() or obj.author.email


class CustomerProfileSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    email = serializers.EmailField(source="user.email", read_only=True)
    phone = serializers.CharField(source="user.phone", read_only=True)
    application_count = serializers.IntegerField(read_only=True)
    branches = serializers.SerializerMethodField()

    class Meta:
        model = CustomerProfile
        fields = (
            "id",
            "customer_code",
            "full_name",
            "email",
            "phone",
            "nationality",
            "city",
            "country",
            "status",
            "application_count",
            "branches",
            "created_at",
        )

    def get_branches(self, obj):
        """Which offices handle this customer.

        A customer account is global — they belong to a branch only through
        the applications they have made, and nothing stops them applying at
        two — so this is a list rather than a single branch. A branch user
        sees only their own, since the queryset is already scoped to it.
        """
        seen = {}
        for application in obj.applications.all():
            branch = application.branch
            if branch is not None and branch.pk not in seen:
                seen[branch.pk] = {
                    "id": branch.pk,
                    "name": branch.name,
                    "code": branch.code,
                }
        return list(seen.values())

    def get_full_name(self, obj):
        return obj.user.get_full_name() or obj.user.email
