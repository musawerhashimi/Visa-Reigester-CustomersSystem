from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from branches.models import Branch
from branches.serializers import BranchBriefSerializer

from .permissions import ALL_PERMISSIONS, permissions_for_role

User = get_user_model()


class AccountSerializer(serializers.ModelSerializer):
    """An account as the administration list and detail views show it."""

    full_name = serializers.CharField(source="get_full_name", read_only=True)
    role_label = serializers.CharField(source="get_role_display", read_only=True)
    effective_permissions = serializers.SerializerMethodField()
    role_defaults = serializers.SerializerMethodField()
    branch = BranchBriefSerializer(read_only=True)
    assigned_count = serializers.IntegerField(read_only=True, default=0)
    last_login_at = serializers.DateTimeField(source="last_login", read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "phone",
            "role",
            "role_label",
            "branch",
            "is_active",
            "email_verified",
            "extra_permissions",
            "denied_permissions",
            "effective_permissions",
            "role_defaults",
            "assigned_count",
            "last_login_at",
            "last_login_ip",
            "created_at",
        )
        read_only_fields = fields

    def get_effective_permissions(self, obj):
        return sorted(obj.effective_permissions())

    def get_role_defaults(self, obj):
        return sorted(permissions_for_role(obj.role))


class PermissionListField(serializers.ListField):
    """A list of permission slugs, checked against the catalogue.

    An unknown slug would sit in the record doing nothing and read as granted
    access, so it is rejected rather than ignored.
    """

    child = serializers.CharField()

    def to_internal_value(self, data):
        slugs = super().to_internal_value(data)
        unknown = sorted(set(slugs) - ALL_PERMISSIONS)
        if unknown:
            raise serializers.ValidationError(
                f"Unknown permission(s): {', '.join(unknown)}."
            )
        return sorted(set(slugs))


class CreateAccountSerializer(serializers.ModelSerializer):
    """Create a staff account. Customers arrive through public signup."""

    password = serializers.CharField(write_only=True, required=False, allow_blank=True)
    extra_permissions = PermissionListField(required=False, default=list)
    denied_permissions = PermissionListField(required=False, default=list)
    # Optional: an account created without one joins the head office, so a
    # scripted or imported account is never left unable to see anything.
    branch_id = serializers.PrimaryKeyRelatedField(
        queryset=Branch.objects.active(), source="branch", required=False
    )

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "phone",
            "role",
            "branch_id",
            "password",
            "extra_permissions",
            "denied_permissions",
        )
        read_only_fields = ("id",)

    def validate_email(self, value):
        value = value.lower().strip()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate_role(self, value):
        if value == User.Role.CUSTOMER:
            raise serializers.ValidationError(
                "Customer accounts are created through signup, not here."
            )
        return value

    def validate(self, attrs):
        password = attrs.get("password")
        if password:
            validate_password(password)
        return attrs

    def create(self, validated_data):
        from .user_views import _generate_password

        password = validated_data.pop("password", "") or _generate_password()
        role = validated_data["role"]

        user = User.objects.create_user(password=password, **validated_data)
        # Staff need the Django admin flag to match their standing, so a
        # super admin can reach it and nobody else can.
        if role == User.Role.SUPER_ADMIN:
            user.is_staff = True
            user.is_superuser = True
            user.save(update_fields=["is_staff", "is_superuser"])

        # Surfaced once in the response so it can be handed to the person.
        self._initial_password = password
        return user

    def to_representation(self, instance):
        data = AccountSerializer(instance, context=self.context).data
        password = getattr(self, "_initial_password", None)
        if password:
            data["initial_password"] = password
        return data


class UpdateAccountSerializer(serializers.ModelSerializer):
    extra_permissions = PermissionListField(required=False)
    denied_permissions = PermissionListField(required=False)
    branch_id = serializers.PrimaryKeyRelatedField(
        queryset=Branch.objects.active(), source="branch", required=False
    )

    class Meta:
        model = User
        fields = (
            "first_name",
            "last_name",
            "phone",
            "role",
            "branch_id",
            "is_active",
            "extra_permissions",
            "denied_permissions",
        )

    def validate_role(self, value):
        if self.instance and self.instance.is_customer and value != User.Role.CUSTOMER:
            raise serializers.ValidationError(
                "A customer account cannot be turned into a staff account."
            )
        if value == User.Role.CUSTOMER and self.instance and not self.instance.is_customer:
            raise serializers.ValidationError(
                "A staff account cannot be turned into a customer account."
            )
        return value

    def update(self, instance, validated_data):
        user = super().update(instance, validated_data)
        is_super = user.role == User.Role.SUPER_ADMIN
        if user.is_superuser != is_super:
            user.is_staff = is_super
            user.is_superuser = is_super
            user.save(update_fields=["is_staff", "is_superuser"])
        return user

    def to_representation(self, instance):
        return AccountSerializer(instance, context=self.context).data


class SetPasswordSerializer(serializers.Serializer):
    """Set a password for someone, or leave blank to generate one."""

    password = serializers.CharField(required=False, allow_blank=True)

    def validate_password(self, value):
        if value:
            validate_password(value, self.context.get("user"))
        return value
