from django.db import models
from django.http import FileResponse, Http404
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts import permissions as perms
from applications.models import Application
from branches.scoping import scope_to_branch, sees_all_branches

from . import services
from .models import OfficialDocument, Payment, Receipt
from .serializers import (
    BillFeeSerializer,
    IssueDocumentSerializer,
    OfficialDocumentSerializer,
    PaymentSerializer,
    ReceiptSerializer,
)


def _scope_to_caller(
    queryset, user, customer_path, assigned_path, branch_path="application__branch"
):
    """Narrow a queryset to what this user may see.

    Customers get their own records; staff get everything or only their
    assigned workload, matching the application rules. Money follows the
    branch handling the application either way.
    """
    if user.is_customer:
        return queryset.filter(**{customer_path: user})

    queryset = scope_to_branch(queryset, user, field=branch_path)

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
    def bill(self, request):
        """Bill the customer for a fee and send them the paperwork.

        The bill reaches the portal and their inbox in one step, so staff do
        not have to chase it with a separate email.
        """
        if not request.user.has_perm_slug(perms.PAYMENTS_MANAGE):
            raise PermissionDenied("You cannot bill customers.")

        serializer = BillFeeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        application = self._billable_application(data["application"])

        try:
            payment, _ = services.bill_fee(
                application,
                kind=data["kind"],
                amount=data["amount"],
                currency=data["currency"],
                card_number=data["card_number"],
                card_owner_name=data["card_owner_name"],
                note=data["note"],
                actor=request.user,
                request=request,
            )
        except services.PaymentError as error:
            return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            self.get_serializer(payment).data, status=status.HTTP_201_CREATED
        )

    @action(detail=True, methods=["post"])
    def settle(self, request, pk=None):
        """Confirm a billed payment has arrived."""
        if not request.user.has_perm_slug(perms.PAYMENTS_MANAGE):
            raise PermissionDenied("You cannot confirm payments.")

        payment = self.get_object()
        try:
            services.settle_payment(payment, actor=request.user, request=request)
        except services.PaymentError as error:
            return Response({"detail": str(error)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(self.get_serializer(payment).data)

    def _billable_application(self, application_id):
        """Resolve an application this user may bill against.

        The payment queryset only reaches applications that already have one,
        so a first bill has to check the branch against the application itself.
        """
        application = Application.objects.alive().filter(pk=application_id).first()
        if application is None:
            raise ValidationError({"application": "Unknown application."})
        if not sees_all_branches(self.request.user):
            if application.branch_id != self.request.user.branch_id:
                raise PermissionDenied("That application belongs to another branch.")
        return application


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

    # Staff may attach the real visa or authority letter, so this action
    # takes multipart as well as the JSON used when the system generates
    # its own letter.
    @action(
        detail=False,
        methods=["post"],
        parser_classes=(MultiPartParser, FormParser, JSONParser),
    )
    def issue(self, request):
        """Issue an official document, from an upload or a generated letter."""
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
                uploaded_file=data.get("file"),
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
