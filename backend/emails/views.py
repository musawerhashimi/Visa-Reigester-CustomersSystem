from django.db import models
from django.http import FileResponse, Http404
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts import permissions as perms
from branches.scoping import sees_all_branches
from applications.models import Application
from applications.services import workflow
from audit import services as audit
from core.permissions import IsMISUser

from . import services
from .models import EmailAttachment, EmailLog, EmailTemplate
from .serializers import (
    ComposeEmailSerializer,
    EmailLogSerializer,
    EmailTemplateSerializer,
    PreviewTemplateSerializer,
)


class EmailTemplateViewSet(viewsets.ModelViewSet):
    """Reusable bodies staff load and then edit before sending (section 31)."""

    queryset = EmailTemplate.objects.all()
    serializer_class = EmailTemplateSerializer
    permission_classes = (IsMISUser,)
    filterset_fields = ("trigger", "is_active")

    def _require_manage(self):
        if not self.request.user.has_perm_slug(perms.EMAILS_TEMPLATES_MANAGE):
            raise PermissionDenied("You cannot manage email templates.")

    def perform_create(self, serializer):
        self._require_manage()
        instance = serializer.save()
        self._audit(instance, "create")

    def perform_update(self, serializer):
        self._require_manage()
        instance = serializer.save()
        self._audit(instance, "update")

    def perform_destroy(self, instance):
        self._require_manage()
        self._audit(instance, "delete")
        instance.delete()

    def _audit(self, instance, action_name):
        audit.record(
            action=action_name,
            module="email_templates",
            actor=self.request.user,
            record_id=instance.pk,
            record_label=instance.name,
            request=self.request,
        )

    @action(detail=False, methods=["post"])
    def preview(self, request):
        """Render a template against an application, ready to edit and send."""
        serializer = PreviewTemplateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        template = EmailTemplate.objects.filter(pk=data["template"]).first()
        if template is None:
            raise ValidationError({"template": "Unknown template."})

        application = None
        if data.get("application"):
            application = _visible_application(request.user, data["application"])

        context = services.build_context(application=application, staff=request.user)
        return Response(
            {
                "subject": services.render(template.subject, context),
                "body": services.render(template.body, context),
                "to_email": (
                    (application.email or application.customer.user.email)
                    if application
                    else ""
                ),
            }
        )


class EmailLogViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    """Everything the system has sent, as the application's correspondence."""

    serializer_class = EmailLogSerializer
    permission_classes = (IsMISUser,)
    filterset_fields = ("application", "status", "is_automatic")
    search_fields = ("to_email", "subject")
    ordering_fields = ("created_at", "sent_at")

    def get_queryset(self):
        user = self.request.user
        queryset = EmailLog.objects.select_related(
            "application", "template", "sent_by"
        ).prefetch_related("attachments")

        # Correspondence follows its application's branch. Email with no
        # application behind it — a reply to a contact enquiry — is not branch
        # work and stays visible to every office.
        if not sees_all_branches(user):
            if user.branch_id is None:
                return queryset.none()
            queryset = queryset.filter(
                models.Q(application__branch=user.branch_id)
                | models.Q(application__isnull=True)
            )

        if user.has_perm_slug(perms.APPLICATIONS_VIEW):
            return queryset
        # An officer sees correspondence on work they can reach, plus anything
        # not tied to an application (a reply to a contact enquiry).
        return queryset.filter(
            models.Q(application__assigned_to=user)
            | models.Q(application__assigned_to__isnull=True)
            | models.Q(application__isnull=True)
        )

    @action(
        detail=False,
        methods=["post"],
        parser_classes=(MultiPartParser, FormParser, JSONParser),
    )
    def compose(self, request):
        """Send a custom email, optionally with attachments (section 30)."""
        if not request.user.has_perm_slug(perms.EMAILS_SEND):
            raise PermissionDenied("You cannot send emails.")

        serializer = ComposeEmailSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        application = None
        if data.get("application"):
            application = _visible_application(request.user, data["application"])

        template = None
        if data.get("template"):
            template = EmailTemplate.objects.filter(pk=data["template"]).first()

        attachments = _collect_attachments(request.user, data, application)

        log = services.send_email(
            to_email=data["to_email"],
            subject=data["subject"],
            body=data["body"],
            application=application,
            template=template,
            sent_by=request.user,
            is_automatic=False,
            attachments=attachments,
            cc=[item for item in data["cc"].split(",") if item] or None,
        )

        if application is not None:
            workflow.add_timeline(
                application,
                action="Email sent",
                description=data["subject"],
                actor=request.user,
            )

        audit.record(
            action="email_sent",
            module="emails",
            actor=request.user,
            record_id=log.pk,
            record_label=data["to_email"],
            description=data["subject"],
            request=request,
        )

        if log.status == EmailLog.Status.FAILED:
            return Response(
                {
                    "detail": "The message could not be delivered.",
                    "error": log.error_message,
                    "email": EmailLogSerializer(log).data,
                },
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response(
            EmailLogSerializer(log).data, status=status.HTTP_201_CREATED
        )


class EmailAttachmentDownloadView(viewsets.GenericViewSet):
    """Serve an attachment from the correspondence history."""

    permission_classes = (IsMISUser,)
    queryset = EmailAttachment.objects.select_related("email__application")

    def get_queryset(self):
        user = self.request.user
        queryset = super().get_queryset()
        if user.has_perm_slug(perms.APPLICATIONS_VIEW):
            return queryset
        return queryset.filter(
            models.Q(email__application__assigned_to=user)
            | models.Q(email__application__assigned_to__isnull=True)
            | models.Q(email__application__isnull=True)
        )

    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        attachment = self.get_object()
        if not attachment.file:
            raise Http404("No file is stored for this attachment.")
        try:
            handle = attachment.file.open("rb")
        except (FileNotFoundError, ValueError) as error:
            raise Http404("The stored file is missing.") from error
        return FileResponse(
            handle,
            as_attachment=True,
            filename=attachment.original_filename or "attachment",
        )


def _visible_application(user, application_id):
    """Resolve an application the caller is allowed to correspond about."""
    queryset = Application.objects.alive().select_related("customer__user")
    application = queryset.filter(pk=application_id).first()
    if application is None:
        raise ValidationError({"application": "Unknown application."})

    if not user.has_perm_slug(perms.APPLICATIONS_VIEW) and application.assigned_to_id not in (
        user.id,
        None,
    ):
        raise PermissionDenied("You cannot access this application.")
    return application


def _collect_attachments(user, data, application):
    """Gather uploaded files plus any existing records staff chose to attach.

    Records are re-checked against this application rather than trusted from
    the request, so a chosen id cannot pull a file from someone else's case.
    """
    from documents.models import Document
    from payments.models import OfficialDocument, Receipt

    attachments = []

    for uploaded in data.get("attachments", []):
        uploaded.seek(0)
        attachments.append(
            {
                "filename": uploaded.name,
                "content": uploaded.read(),
                "mimetype": getattr(uploaded, "content_type", None),
            }
        )

    if application is None:
        return attachments

    selections = (
        (Document, data.get("attach_documents", []), "file", "original_filename"),
        (Receipt, data.get("attach_receipts", []), "pdf", "receipt_number"),
        (
            OfficialDocument,
            data.get("attach_official_documents", []),
            "pdf",
            "title",
        ),
    )

    for model, ids, field_name, label_attr in selections:
        if not ids:
            continue
        for record in model.objects.filter(pk__in=ids, application=application):
            field = getattr(record, field_name, None)
            if not field:
                continue
            try:
                field.open("rb")
                content = field.read()
                field.close()
            except (FileNotFoundError, ValueError):
                continue

            label = str(getattr(record, label_attr, "") or "attachment")
            filename = label if label.lower().endswith(".pdf") else f"{label}.pdf"
            attachments.append(
                {
                    "filename": filename,
                    "content": content,
                    "mimetype": "application/pdf",
                }
            )

    return attachments
