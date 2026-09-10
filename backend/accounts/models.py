from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models
from django.utils import timezone

from core.models import TimeStampedModel

from .permissions import permissions_for_role


class UserManager(BaseUserManager):
    """Email is the login identifier; there are no usernames in this system."""

    use_in_migrations = True

    def _create_user(self, email, password, **extra):
        if not email:
            raise ValueError("An email address is required.")
        email = self.normalize_email(email)
        user = self.model(email=email, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra):
        extra.setdefault("role", User.Role.CUSTOMER)
        extra.setdefault("is_staff", False)
        extra.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra)

    def create_superuser(self, email, password=None, **extra):
        extra.setdefault("role", User.Role.SUPER_ADMIN)
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        extra.setdefault("is_active", True)
        extra.setdefault("email_verified_at", timezone.now())
        if extra["is_staff"] is not True or extra["is_superuser"] is not True:
            raise ValueError("Superuser must have is_staff and is_superuser set.")
        return self._create_user(email, password, **extra)


class User(AbstractUser, TimeStampedModel):
    """One account table for everyone, separated by role.

    Customers reach the public portal; every other role reaches the MIS. The
    `role` decides the default permission set, and `extra_permissions` lets an
    admin grant something beyond it without inventing a new role.
    """

    class Role(models.TextChoices):
        SUPER_ADMIN = "super_admin", "Super Admin"
        ADMIN = "admin", "Admin / Manager"
        VISA_OFFICER = "visa_officer", "Visa Officer / Staff"
        CMS_MANAGER = "cms_manager", "CMS Manager"
        CUSTOMER = "customer", "Customer"

    username = None
    email = models.EmailField(unique=True, db_index=True)
    role = models.CharField(
        max_length=20, choices=Role.choices, default=Role.CUSTOMER, db_index=True
    )

    first_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100, blank=True)
    phone = models.CharField(max_length=30, blank=True, db_index=True)

    email_verified_at = models.DateTimeField(null=True, blank=True)
    phone_verified_at = models.DateTimeField(null=True, blank=True)
    last_login_ip = models.GenericIPAddressField(null=True, blank=True)

    # Permissions granted on top of, or revoked from, the role's defaults.
    extra_permissions = models.JSONField(default=list, blank=True)
    denied_permissions = models.JSONField(default=list, blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    objects = UserManager()

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.get_full_name() or self.email} ({self.get_role_display()})"

    def get_full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def is_customer(self):
        return self.role == self.Role.CUSTOMER

    @property
    def is_mis_user(self):
        return self.role != self.Role.CUSTOMER

    @property
    def email_verified(self):
        return self.email_verified_at is not None

    def effective_permissions(self):
        granted = permissions_for_role(self.role) | set(self.extra_permissions or [])
        return granted - set(self.denied_permissions or [])

    def has_perm_slug(self, slug):
        """Check a system permission slug such as 'applications.verify'.

        Deliberately named apart from Django's `has_perm` so the two schemes
        never get confused at a call site.
        """
        if self.role == self.Role.SUPER_ADMIN:
            return slug not in set(self.denied_permissions or [])
        return slug in self.effective_permissions()


class LoginHistory(TimeStampedModel):
    """Login audit trail, surfaced on the customer's own security page."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="login_history")
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=400, blank=True)
    successful = models.BooleanField(default=True)

    class Meta:
        ordering = ("-created_at",)
        verbose_name_plural = "login history"

    def __str__(self):
        outcome = "ok" if self.successful else "failed"
        return f"{self.user.email} {outcome} @ {self.created_at:%Y-%m-%d %H:%M}"


class EmailVerificationToken(TimeStampedModel):
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="verification_tokens"
    )
    token = models.CharField(max_length=128, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)

    @property
    def is_valid(self):
        return self.used_at is None and self.expires_at > timezone.now()


class PasswordResetToken(TimeStampedModel):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="reset_tokens")
    token = models.CharField(max_length=128, unique=True, db_index=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)

    @property
    def is_valid(self):
        return self.used_at is None and self.expires_at > timezone.now()
