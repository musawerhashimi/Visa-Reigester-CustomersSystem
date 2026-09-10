from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import permissions, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from accounts import permissions as perms
from audit import services as audit
from emails import services as email_service
from notifications import services as notify_service
from notifications.models import Notification

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
from .serializers import (
    ActivitySerializer,
    BannerSerializer,
    CompanyInfoSerializer,
    ContactMessageCreateSerializer,
    ContactMessageSerializer,
    ContactReplySerializer,
    EventSerializer,
    FAQSerializer,
    GalleryItemSerializer,
    NewsSerializer,
    PageSerializer,
    ServiceSerializer,
    TeamMemberSerializer,
    TestimonialSerializer,
)


class CMSContentViewSet(viewsets.ModelViewSet):
    """Public site content, readable by anyone and editable by the CMS.

    Reading is open because this is the public website; writing requires the
    permission named by `manage_permission`. Visitors see published records
    only, so an unfinished draft cannot leak through a guessed URL.
    """

    manage_permission = None
    filter_backends = (DjangoFilterBackend,)

    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def _can_manage(self):
        user = self.request.user
        return bool(
            user
            and user.is_authenticated
            and self.manage_permission
            and user.has_perm_slug(self.manage_permission)
        )

    def get_queryset(self):
        queryset = self.queryset
        if self._can_manage():
            return queryset
        return queryset.filter(status="published")

    def _require_manage(self):
        if not self._can_manage():
            raise PermissionDenied("You cannot manage this content.")

    def perform_create(self, serializer):
        self._require_manage()
        instance = serializer.save()
        self._stamp_publication(instance, serializer)
        self._audit(instance, "create")

    def perform_update(self, serializer):
        self._require_manage()
        previous_status = serializer.instance.status
        instance = serializer.save()
        self._stamp_publication(instance, serializer, previous_status)
        self._audit(instance, "update")

    def perform_destroy(self, instance):
        self._require_manage()
        self._audit(instance, "delete")
        instance.delete()

    def _stamp_publication(self, instance, serializer, previous_status=None):
        """Record when something first went live, for the public ordering."""
        if instance.status == "published" and instance.published_at is None:
            instance.published_at = timezone.now()
            instance.save(update_fields=["published_at", "updated_at"])
        elif (
            previous_status == "published"
            and instance.status != "published"
        ):
            # Keep published_at: unpublishing is usually temporary, and
            # clearing it would lose the original publication date.
            pass

    def _audit(self, instance, action_name):
        audit.record(
            action=action_name,
            module=f"cms.{instance._meta.model_name}",
            actor=self.request.user,
            record_id=instance.pk,
            record_label=str(instance)[:200],
            request=self.request,
        )

    @action(detail=True, methods=["post"])
    def publish(self, request, **kwargs):
        self._require_manage()
        instance = self.get_object()

        # Re-validate: publishing is the moment the English fallback must
        # exist, and a draft may have been saved without it.
        serializer = self.get_serializer(
            instance, data={"status": "published"}, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        if instance.published_at is None:
            instance.published_at = timezone.now()
            instance.save(update_fields=["published_at", "updated_at"])

        self._audit(instance, "update")
        return Response(self.get_serializer(instance).data)

    @action(detail=True, methods=["post"])
    def unpublish(self, request, **kwargs):
        self._require_manage()
        instance = self.get_object()
        instance.status = "draft"
        instance.save(update_fields=["status", "updated_at"])
        self._audit(instance, "update")
        return Response(self.get_serializer(instance).data)


class ServiceViewSet(CMSContentViewSet):
    queryset = Service.objects.all()
    serializer_class = ServiceSerializer
    manage_permission = perms.CMS_SERVICES_MANAGE
    lookup_field = "slug"
    filterset_fields = ("is_featured", "status")


class ActivityViewSet(CMSContentViewSet):
    queryset = Activity.objects.all()
    serializer_class = ActivitySerializer
    manage_permission = perms.CMS_ACTIVITIES_MANAGE
    lookup_field = "slug"
    filterset_fields = ("category", "status")


class NewsViewSet(CMSContentViewSet):
    queryset = News.objects.all()
    serializer_class = NewsSerializer
    manage_permission = perms.CMS_NEWS_MANAGE
    lookup_field = "slug"
    filterset_fields = ("category", "status")

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        # Count reads from the public site only, so editors previewing their
        # own article do not inflate the figure.
        if not self._can_manage():
            News.objects.filter(pk=instance.pk).update(views=instance.views + 1)
        return Response(self.get_serializer(instance).data)


class EventViewSet(CMSContentViewSet):
    queryset = Event.objects.all()
    serializer_class = EventSerializer
    manage_permission = perms.CMS_EVENTS_MANAGE
    lookup_field = "slug"
    filterset_fields = ("status",)


class GalleryViewSet(CMSContentViewSet):
    queryset = GalleryItem.objects.all()
    serializer_class = GalleryItemSerializer
    manage_permission = perms.CMS_GALLERY_MANAGE
    filterset_fields = ("category", "is_featured", "status")


class FAQViewSet(CMSContentViewSet):
    queryset = FAQ.objects.all()
    serializer_class = FAQSerializer
    manage_permission = perms.CMS_PAGES_MANAGE
    filterset_fields = ("category", "status")


class TestimonialViewSet(CMSContentViewSet):
    queryset = Testimonial.objects.all()
    serializer_class = TestimonialSerializer
    manage_permission = perms.CMS_PAGES_MANAGE
    filterset_fields = ("status",)


class BannerViewSet(CMSContentViewSet):
    queryset = Banner.objects.all()
    serializer_class = BannerSerializer
    manage_permission = perms.CMS_PAGES_MANAGE
    filterset_fields = ("status",)


class TeamMemberViewSet(CMSContentViewSet):
    queryset = TeamMember.objects.all()
    serializer_class = TeamMemberSerializer
    manage_permission = perms.CMS_PAGES_MANAGE
    filterset_fields = ("status",)


class PageViewSet(CMSContentViewSet):
    queryset = Page.objects.all()
    serializer_class = PageSerializer
    manage_permission = perms.CMS_PAGES_MANAGE
    lookup_field = "slug"
    filterset_fields = ("status",)


class CompanyInfoView(APIView):
    """The single company record behind the About page and site footer."""

    def get_permissions(self):
        if self.request.method in permissions.SAFE_METHODS:
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def get(self, request):
        return Response(CompanyInfoSerializer(CompanyInfo.load()).data)

    def patch(self, request):
        if not request.user.has_perm_slug(perms.CMS_PAGES_MANAGE):
            raise PermissionDenied("You cannot manage company information.")

        instance = CompanyInfo.load()
        serializer = CompanyInfoSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        audit.record(
            action="update",
            module="cms.companyinfo",
            actor=request.user,
            record_id=instance.pk,
            record_label="Company info",
            request=request,
        )
        return Response(serializer.data)


class ContactMessageViewSet(viewsets.ModelViewSet):
    """Public contact form in, MIS inbox out."""

    queryset = ContactMessage.objects.all()
    filterset_fields = ("status",)
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "anon"

    def get_serializer_class(self):
        if self.action == "create":
            return ContactMessageCreateSerializer
        return ContactMessageSerializer

    def get_permissions(self):
        if self.action == "create":
            return [permissions.AllowAny()]
        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated or not user.has_perm_slug(
            perms.CMS_CONTACT_MANAGE
        ):
            return ContactMessage.objects.none()
        return ContactMessage.objects.all()

    def perform_create(self, serializer):
        message = serializer.save()
        # A contact form that vanishes into the database is useless; alert
        # whoever handles the inbox.
        notify_service.notify_mis(
            category=Notification.Category.CONTACT_MESSAGE,
            title="New contact message",
            message=f"{message.name}: {message.subject or message.message[:60]}",
            link="/mis/contact",
        )

    @action(detail=True, methods=["post"])
    def reply(self, request, pk=None):
        if not request.user.has_perm_slug(perms.CMS_CONTACT_MANAGE):
            raise PermissionDenied("You cannot reply to contact messages.")

        message = self.get_object()
        serializer = ContactReplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        body = serializer.validated_data["body"]

        email_service.send_email(
            to_email=message.email,
            subject=f"Re: {message.subject or 'Your enquiry'}",
            body=body,
            sent_by=request.user,
            is_automatic=False,
        )

        message.reply_body = body
        message.replied_at = timezone.now()
        message.status = ContactMessage.Status.REPLIED
        message.save(update_fields=["reply_body", "replied_at", "status", "updated_at"])

        audit.record(
            action="email_sent",
            module="cms.contactmessage",
            actor=request.user,
            record_id=message.pk,
            record_label=message.email,
            request=request,
        )
        return Response(ContactMessageSerializer(message).data)

    @action(detail=True, methods=["post"], url_path="mark-read")
    def mark_read(self, request, pk=None):
        if not request.user.has_perm_slug(perms.CMS_CONTACT_MANAGE):
            raise PermissionDenied("You cannot manage contact messages.")

        message = self.get_object()
        if message.status == ContactMessage.Status.NEW:
            message.status = ContactMessage.Status.READ
            message.save(update_fields=["status", "updated_at"])
        return Response(ContactMessageSerializer(message).data)
