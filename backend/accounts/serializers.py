from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from branches.serializers import BranchBriefSerializer
from customers.models import CustomerProfile

from .models import LoginHistory, User


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source="get_full_name", read_only=True)
    permissions = serializers.SerializerMethodField()
    branch = BranchBriefSerializer(read_only=True)
    # The MIS keys "show everything" off this rather than re-deriving the rule.
    sees_all_branches = serializers.BooleanField(read_only=True)

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
            "branch",
            "sees_all_branches",
            "is_active",
            "email_verified",
            "permissions",
            "created_at",
        )
        read_only_fields = ("id", "role", "is_active", "email_verified", "created_at")

    def get_permissions(self, obj):
        return sorted(obj.effective_permissions())


class RegistrationSerializer(serializers.ModelSerializer):
    """Public signup. Always creates a customer, never an MIS account.

    Identity-document details are deliberately not collected here; they belong
    to the application workflow, where they can be verified and access-controlled.
    """

    password = serializers.CharField(write_only=True, style={"input_type": "password"})
    confirm_password = serializers.CharField(
        write_only=True, style={"input_type": "password"}
    )

    father_name = serializers.CharField(required=False, allow_blank=True)
    date_of_birth = serializers.DateField(required=False, allow_null=True)
    gender = serializers.ChoiceField(
        choices=CustomerProfile.Gender.choices, required=False, allow_blank=True
    )
    nationality = serializers.CharField(required=False, allow_blank=True)
    address = serializers.CharField(required=False, allow_blank=True)
    city = serializers.CharField(required=False, allow_blank=True)
    country = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = User
        fields = (
            "email",
            "first_name",
            "last_name",
            "phone",
            "password",
            "confirm_password",
            "father_name",
            "date_of_birth",
            "gender",
            "nationality",
            "address",
            "city",
            "country",
        )

    def validate_email(self, value):
        value = value.lower().strip()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate(self, attrs):
        if attrs["password"] != attrs.pop("confirm_password"):
            raise serializers.ValidationError(
                {"confirm_password": "The two passwords do not match."}
            )
        validate_password(attrs["password"])
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        profile_fields = {
            key: validated_data.pop(key, "")
            for key in (
                "father_name",
                "date_of_birth",
                "gender",
                "nationality",
                "address",
                "city",
                "country",
            )
        }
        password = validated_data.pop("password")
        user = User.objects.create_user(
            password=password, role=User.Role.CUSTOMER, **validated_data
        )
        CustomerProfile.objects.create(
            user=user,
            **{k: v for k, v in profile_fields.items() if v not in ("", None)},
        )
        return user


class LoginSerializer(TokenObtainPairSerializer):
    """Issues JWTs and records the attempt against the account."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token["role"] = user.role
        token["email"] = user.email
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        request = self.context.get("request")

        if not self.user.is_active:
            raise serializers.ValidationError("This account is deactivated.")

        ip = _client_ip(request)
        LoginHistory.objects.create(
            user=self.user,
            ip_address=ip,
            user_agent=(request.META.get("HTTP_USER_AGENT", "")[:400] if request else ""),
            successful=True,
        )
        if ip:
            self.user.last_login_ip = ip
            self.user.save(update_fields=["last_login_ip", "updated_at"])

        data["user"] = UserSerializer(self.user).data
        return data


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)

    def validate_current_password(self, value):
        if not self.context["request"].user.check_password(value):
            raise serializers.ValidationError("Your current password is incorrect.")
        return value

    def validate_new_password(self, value):
        validate_password(value, self.context["request"].user)
        return value

    def save(self, **kwargs):
        user = self.context["request"].user
        user.set_password(self.validated_data["new_password"])
        user.save(update_fields=["password", "updated_at"])
        return user


class LoginHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = LoginHistory
        fields = ("id", "ip_address", "user_agent", "successful", "created_at")


def _client_ip(request):
    if request is None:
        return None
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")
