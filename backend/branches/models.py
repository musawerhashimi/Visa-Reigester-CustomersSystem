from django.db import models

from core.models import TimeStampedModel


class BranchQuerySet(models.QuerySet):
    def active(self):
        return self.filter(is_active=True)


class Branch(TimeStampedModel):
    """An office the company runs. Work is partitioned between branches.

    Exactly one branch is the general one (`is_general`), created by migration
    and never deleted. Staff attached to it see every branch's work; staff
    attached to any other branch see only their own. Branches are flat: the
    general branch is the root and the rest sit beside each other under it.
    """

    name = models.CharField(max_length=120, unique=True)
    code = models.CharField(
        max_length=10,
        unique=True,
        help_text="Short identifier shown next to the branch, e.g. KBL.",
    )

    # The general branch is the one whose staff see across branches. It is a
    # flag rather than a role so the rule stays in the data, and it is unique
    # by a constraint below so a second one cannot be created by accident.
    is_general = models.BooleanField(default=False)

    city = models.CharField(max_length=100, blank=True)
    country = models.CharField(max_length=100, blank=True)
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)

    is_active = models.BooleanField(default=True, db_index=True)

    #: The address customers see and reply to on this branch's mail. Blank
    #: falls back to the company sender, so a branch works before it is set up.
    sending_email = models.EmailField(blank=True)

    #: This branch's own mail server. A branch with its own mailbox sends from
    #: it directly rather than through head office, so replies reach the people
    #: handling the work. Blank fields fall back to the company server.
    smtp_host = models.CharField(max_length=200, blank=True)
    smtp_port = models.PositiveIntegerField(null=True, blank=True)
    smtp_username = models.CharField(max_length=200, blank=True)
    #: Encrypted at rest (core.encryption); never returned by the API.
    smtp_password_encrypted = models.TextField(blank=True)
    smtp_use_tls = models.BooleanField(default=True)
    #: While false this branch uses the company mail server.
    smtp_enabled = models.BooleanField(default=False)

    objects = BranchQuerySet.as_manager()

    def set_smtp_password(self, raw):
        from core.encryption import encrypt

        self.smtp_password_encrypted = encrypt(raw or "")

    def get_smtp_password(self):
        from core.encryption import decrypt

        return decrypt(self.smtp_password_encrypted)

    @property
    def has_own_mail_server(self):
        return bool(self.smtp_enabled and self.smtp_host)

    class Meta:
        ordering = ("-is_general", "name")
        verbose_name_plural = "branches"
        constraints = [
            models.UniqueConstraint(
                fields=["is_general"],
                condition=models.Q(is_general=True),
                name="branch_single_general",
            )
        ]

    def __str__(self):
        return f"{self.name} ({self.code})"

    @classmethod
    def general(cls):
        return cls.objects.filter(is_general=True).first()
