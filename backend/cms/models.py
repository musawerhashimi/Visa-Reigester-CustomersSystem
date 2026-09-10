from django.db import models

from core.i18n import TranslatedField, translate
from core.models import PublishableModel, TimeStampedModel


class CompanyInfo(TimeStampedModel):
    """Singleton row holding the About page and site-wide company details."""

    name = TranslatedField()
    description = TranslatedField(blank=True)
    mission = TranslatedField(blank=True)
    vision = TranslatedField(blank=True)
    goals = TranslatedField(blank=True)
    history = TranslatedField(blank=True)
    values = TranslatedField(blank=True)
    working_hours = TranslatedField(blank=True)

    logo = models.ImageField(upload_to="company/", blank=True, null=True)
    address = models.TextField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    website = models.URLField(blank=True)
    social_links = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name_plural = "company info"

    def __str__(self):
        return translate(self.name) or "Company info"

    def save(self, *args, **kwargs):
        # One company, one row.
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class TeamMember(PublishableModel):
    name = models.CharField(max_length=150)
    position = TranslatedField()
    bio = TranslatedField(blank=True)
    photo = models.ImageField(upload_to="team/", blank=True, null=True)
    social_links = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ("display_order", "id")

    def __str__(self):
        return self.name


class Service(PublishableModel):
    slug = models.SlugField(max_length=140, unique=True)
    name = TranslatedField()
    description = TranslatedField(blank=True)
    requirements = TranslatedField(blank=True)
    processing_info = TranslatedField(blank=True)
    estimated_time = TranslatedField(blank=True)
    fee_info = TranslatedField(blank=True)
    image = models.ImageField(upload_to="services/", blank=True, null=True)
    is_featured = models.BooleanField(default=False)

    class Meta:
        ordering = ("display_order", "id")

    def __str__(self):
        return translate(self.name)


class Activity(PublishableModel):
    slug = models.SlugField(max_length=160, unique=True)
    title = TranslatedField()
    short_description = TranslatedField(blank=True)
    full_description = TranslatedField(blank=True)
    cover_image = models.ImageField(upload_to="activities/", blank=True, null=True)
    date = models.DateField(null=True, blank=True, db_index=True)
    location = TranslatedField(blank=True)
    category = models.CharField(max_length=80, blank=True)

    class Meta:
        ordering = ("-date", "-created_at")
        verbose_name_plural = "activities"

    def __str__(self):
        return translate(self.title)


class News(PublishableModel):
    slug = models.SlugField(max_length=180, unique=True)
    title = TranslatedField()
    short_description = TranslatedField(blank=True)
    content = TranslatedField(blank=True)
    featured_image = models.ImageField(upload_to="news/", blank=True, null=True)
    author = models.CharField(max_length=150, blank=True)
    category = models.CharField(max_length=80, blank=True, db_index=True)
    views = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ("-published_at", "-created_at")
        verbose_name_plural = "news"

    def __str__(self):
        return translate(self.title)


class Event(PublishableModel):
    slug = models.SlugField(max_length=180, unique=True)
    title = TranslatedField()
    description = TranslatedField(blank=True)
    start_date = models.DateTimeField(db_index=True)
    end_date = models.DateTimeField(null=True, blank=True)
    location = TranslatedField(blank=True)
    image = models.ImageField(upload_to="events/", blank=True, null=True)
    registration_info = TranslatedField(blank=True)

    class Meta:
        ordering = ("-start_date",)

    def __str__(self):
        return translate(self.title)


class GalleryItem(PublishableModel):
    class Category(models.TextChoices):
        EVENTS = "events", "Events"
        OFFICE = "office", "Office"
        ACTIVITIES = "activities", "Activities"
        CUSTOMERS = "customers", "Customers"
        COMPANY = "company", "Company"
        OTHER = "other", "Other"

    title = TranslatedField(blank=True)
    description = TranslatedField(blank=True)
    image = models.ImageField(upload_to="gallery/")
    category = models.CharField(
        max_length=20, choices=Category.choices, default=Category.OTHER, db_index=True
    )
    is_featured = models.BooleanField(default=False)

    class Meta:
        ordering = ("display_order", "-created_at")

    def __str__(self):
        return translate(self.title) or f"Gallery item {self.pk}"


class FAQ(PublishableModel):
    question = TranslatedField()
    answer = TranslatedField()
    category = models.CharField(max_length=80, blank=True)

    class Meta:
        ordering = ("display_order", "id")
        verbose_name = "FAQ"

    def __str__(self):
        return translate(self.question)


class Testimonial(PublishableModel):
    customer_name = models.CharField(max_length=150)
    content = TranslatedField()
    role = TranslatedField(blank=True)
    photo = models.ImageField(upload_to="testimonials/", blank=True, null=True)
    rating = models.PositiveSmallIntegerField(default=5)

    class Meta:
        ordering = ("display_order", "-created_at")

    def __str__(self):
        return self.customer_name


class Banner(PublishableModel):
    title = TranslatedField(blank=True)
    subtitle = TranslatedField(blank=True)
    image = models.ImageField(upload_to="banners/")
    cta_label = TranslatedField(blank=True)
    cta_url = models.CharField(max_length=300, blank=True)

    class Meta:
        ordering = ("display_order", "id")

    def __str__(self):
        return translate(self.title) or f"Banner {self.pk}"


class Page(PublishableModel):
    """Free-form CMS page for anything without a dedicated model."""

    slug = models.SlugField(max_length=180, unique=True)
    title = TranslatedField()
    content = TranslatedField(blank=True)
    meta_description = TranslatedField(blank=True)

    def __str__(self):
        return translate(self.title)


class ContactMessage(TimeStampedModel):
    """Submission from the public contact form; lands in the MIS inbox."""

    class Status(models.TextChoices):
        NEW = "new", "New"
        READ = "read", "Read"
        REPLIED = "replied", "Replied"
        ARCHIVED = "archived", "Archived"

    name = models.CharField(max_length=150)
    email = models.EmailField()
    phone = models.CharField(max_length=30, blank=True)
    subject = models.CharField(max_length=200, blank=True)
    message = models.TextField()

    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.NEW, db_index=True
    )
    reply_body = models.TextField(blank=True)
    replied_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.name} · {self.subject or 'no subject'}"
