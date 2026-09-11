from django.db import models
from django.http import FileResponse, Http404
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from accounts import permissions as perms
from applications.models import Application

from . import services
from .models import OfficialDocument, Payment, Receipt
from .serializers import (
    IssueDocumentSerializer,
    OfficialDocumentSerializer,
    PaymentSerializer,
    ReceiptSerializer,
    RecordPaymentSerializer,
)


def _scope_to_caller(queryset, user, customer_path, assigned_path):
    """Narrow a queryset to what this user may see.

    Customers get their own records; staff get everything or only their
    assigned workload, matching the application rules.
    """
    if user.is_customer:
        return queryset.filter(**{customer_path: user})
    if user.has_perm_slug(perms.APPLICATIONS_VIEW) or user.has_perm_slug(
        perms.PAYMENTS_VIEW
    ):
        return queryset
    return queryset.filter(
        models.Q(**{assigned_path: user}) | models.Q(**{f"{assigned_path}__isnull": True})
    )


class PaymentViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    """Payments recorded by staff; customers see their own."""

    serializer_class = PaymentSerializer
    filterset_fields = ("status", "method", "application")

    def get_queryset(self):
        queryset = Payment.objects.select_related(
            "application", "customer__user", "recorded_by", "receipt"
        )
        return _scope_to_caller(
            queryset,
            self.request.user,
            "customer__user",
            "application__assigned_to",
        )

    @action(detail=False, methods=["post"])
    def record(self, request):
        """Record a cash or transfer payment taken at the office."""
        if not request.user.has_perm_slug(perms.PAYMENTS_MANAGE):
            raise PermissionDenied("You cannot record payments.")

        serializer = RecordPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        application = Application.objects.alive().filter(pk=data["application"]).first()
        if application is None:
            raise ValidationError({"application": "Unknown application."})

        try:
            payment, _ = services.record_payment(
                application,
                amount=data["amount"],
                currency=data["currency"],
                method=data["method"],
                status=data["status"],
                paid_at=data.get("paid_at"),
                reference=data["reference"],
                note=data["note"],
                actor=request.user,
                request=request,
                issue_receipt=data["issue_receipt"],
            )
        except services.PaymentError as error:
            return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            self.get_serializer(payment).data, status=status.HTTP_201_CREATED
        )


class ReceiptViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    serializer_class = ReceiptSerializer
    filterset_fields = ("application",)

    def get_queryset(self):
        queryset = Receipt.objects.select_related("application", "payment")
        queryset = _scope_to_caller(
            queryset,
            self.request.user,
            "application__customer__user",
            "application__assigned_to",
        )
        # A receipt withheld from the portal stays invisible to the customer.
        if self.request.user.is_customer:
            queryset = queryset.filter(is_available_to_customer=True)
        return queryset

    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        receipt = self.get_object()
        return _serve_pdf(receipt.pdf, f"{receipt.receipt_number}.pdf")


class OfficialDocumentViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    serializer_class = OfficialDocumentSerializer
    filterset_fields = ("application", "kind")

    def get_queryset(self):
        queryset = OfficialDocument.objects.select_related("application", "generated_by")
        queryset = _scope_to_caller(
            queryset,
            self.request.user,
            "application__customer__user",
            "application__assigned_to",
        )
        if self.request.user.is_customer:
            queryset = queryset.filter(is_available_to_customer=True)
        return queryset

    @action(detail=True, methods=["get"])
    def download(self, request, pk=None):
        document = self.get_object()
        name = (document.pdf.name or "document.pdf").split("/")[-1]
        return _serve_pdf(document.pdf, name)

    @action(detail=False, methods=["post"])
    def issue(self, request):
        """Generate a verification certificate or approval letter."""
        if not request.user.has_perm_slug(perms.RECEIPTS_GENERATE):
            raise PermissionDenied("You cannot issue official documents.")

        application_id = request.data.get("application")
        application = Application.objects.alive().filter(pk=application_id).first()
        if application is None:
            raise ValidationError({"application": "Unknown application."})

        serializer = IssueDocumentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            document = services.issue_official_document(
                application,
                kind=data["kind"],
                title=data["title"],
                release_to_customer=data["release_to_customer"],
                send_email=data["send_email"],
                actor=request.user,
                request=request,
            )
        except services.PaymentError as error:
            return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            self.get_serializer(document).data, status=status.HTTP_201_CREATED
        )


def _serve_pdf(field, filename):
    if not field:
        raise Http404("No file has been generated for this record.")
    try:
        handle = field.open("rb")
    except (FileNotFoundError, ValueError) as error:
        raise Http404("The stored file is missing.") from error
    return FileResponse(handle, as_attachment=True, filename=filename)
