from rest_framework import serializers

from documents.serializers import DocumentSerializer
from visas.models import VisaType
from visas.serializers import VisaTypeBriefSerializer

from .models import Application, ApplicationStatus, ApplicationTimeline, ChangeRequest


class TimelineSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()

    class Meta:
        model = ApplicationTimeline
        fields = (
            "id",
            "action",
            "description",
            "from_status",
            "to_status",
            "actor_name",
            "created_at",
        )

    def get_actor_name(self, obj):
        if obj.actor is None:
            return None
        return obj.actor.get_full_name() or obj.actor.email


class ApplicationListSerializer(serializers.ModelSerializer):
    """Row shape for both the MIS list and the customer's application list."""

    visa_type = VisaTypeBriefSerializer(read_only=True)
    full_name = serializers.CharField(read_only=True)
    assigned_to = serializers.SerializerMethodField()
    customer_name = serializers.SerializerMethodField()

    class Meta:
        model = Application
        fields = (
            "id",
            "application_number",
            "full_name",
            "customer_name",
            "status",
            "priority",
            "visa_type",
            "submitted_at",
            "created_at",
            "assigned_to",
        )

    def get_assigned_to(self, obj):
        if obj.assigned_to is None:
            return None
        return {
            "id": obj.assigned_to.id,
            "full_name": obj.assigned_to.get_full_name() or obj.assigned_to.email,
        }

    def get_customer_name(self, obj):
        user = obj.customer.user
        return user.get_full_name() or user.email


class ApplicationDetailSerializer(serializers.ModelSerializer):
    visa_type = VisaTypeBriefSerializer(read_only=True)
    visa_type_id = serializers.PrimaryKeyRelatedField(
        queryset=VisaType.objects.all(), source="visa_type", write_only=True
    )
    documents = serializers.SerializerMethodField()
    timeline = serializers.SerializerMethodField()
    full_name = serializers.CharField(read_only=True)
    is_editable_by_customer = serializers.BooleanField(read_only=True)
    missing_documents = serializers.SerializerMethodField()
    customer = serializers.SerializerMethodField()
    assigned_to = serializers.SerializerMethodField()
    allowed_transitions = serializers.SerializerMethodField()

    class Meta:
        model = Application
        fields = (
            "id",
            "application_number",
            "status",
            "priority",
            "visa_type",
            "visa_type_id",
            "full_name",
            "first_name",
            "middle_name",
            "last_name",
            "father_name",
            "mother_name",
            "date_of_birth",
            "place_of_birth",
            "gender",
            "nationality",
            "marital_status",
            "email",
            "phone",
            "alternative_phone",
            "current_address",
            "city",
            "country",
            "passport_number",
            "passport_type",
            "passport_issue_date",
            "passport_expiry_date",
            "passport_issue_country",
            "purpose_of_travel",
            "expected_travel_date",
            "expected_return_date",
            "previous_visa",
            "previous_travel_history",
            "education",
            "occupation",
            "employer",
            "emergency_contact",
            "additional_notes",
            "submitted_at",
            "verified_at",
            "decided_at",
            "rejection_reason",
            "cancellation_reason",
            "is_editable_by_customer",
            "missing_documents",
            "customer",
            "assigned_to",
            "allowed_transitions",
            "documents",
            "timeline",
            "created_at",
        )
        read_only_fields = (
            "id",
            "application_number",
            "status",
            "submitted_at",
            "verified_at",
            "decided_at",
            "rejection_reason",
            "cancellation_reason",
        )

    def get_documents(self, obj):
        documents = obj.documents.filter(is_current=True).select_related("document_type")
        return DocumentSerializer(documents, many=True, context=self.context).data

    def get_timeline(self, obj):
        entries = obj.timeline.select_related("actor")
        user = self.context["request"].user
        if user.is_customer:
            entries = entries.filter(visible_to_customer=True)
        return TimelineSerializer(entries, many=True).data

    def get_missing_documents(self, obj):
        from .services import workflow

        return workflow.missing_mandatory_documents(obj)

    def get_customer(self, obj):
        """Who the applicant is. Staff-only: a customer already knows."""
        request = self.context.get("request")
        if request and request.user.is_customer:
            return None
        user = obj.customer.user
        return {
            "id": obj.customer.id,
            "customer_code": obj.customer.customer_code,
            "full_name": user.get_full_name() or user.email,
            "email": user.email,
            "phone": user.phone,
        }

    def get_assigned_to(self, obj):
        if obj.assigned_to is None:
            return None
        # Section 57 leaves this to company policy; the officer's name is
        # withheld from the customer here.
        request = self.context.get("request")
        if request and request.user.is_customer:
            return {"id": None, "full_name": "Assigned"}
        return {
            "id": obj.assigned_to.id,
            "full_name": obj.assigned_to.get_full_name() or obj.assigned_to.email,
        }

    def get_allowed_transitions(self, obj):
        """Statuses this application may move to next.

        Served from the workflow's own map so the MIS cannot offer a
        transition the backend would then refuse.
        """
        request = self.context.get("request")
        if request and request.user.is_customer:
            return []

        from .services.workflow import ALLOWED_TRANSITIONS

        return [
            {"value": status, "label": ApplicationStatus(status).label}
            for status in sorted(ALLOWED_TRANSITIONS.get(obj.status, set()))
        ]

    def validate(self, attrs):
        """Block customer edits once the application is locked (section 16)."""
        request = self.context.get("request")
        if (
            self.instance is not None
            and request is not None
            and request.user.is_customer
            and not self.instance.is_editable_by_customer
        ):
            raise serializers.ValidationError(
                "This application can no longer be edited directly. "
                "Please submit a change request."
            )
        return attrs


class StatusChangeSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=ApplicationStatus.choices)
    note = serializers.CharField(required=False, allow_blank=True, default="")


class AssignSerializer(serializers.Serializer):
    staff_id = serializers.IntegerField()
    priority = serializers.ChoiceField(
        choices=Application.Priority.choices, required=False
    )


class CancelSerializer(serializers.Serializer):
    reason = serializers.CharField()


class ChangeRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChangeRequest
        fields = (
            "id",
            "application",
            "field_name",
            "current_value",
            "requested_value",
            "reason",
            "status",
            "review_note",
            "reviewed_at",
            "created_at",
        )
        read_only_fields = ("id", "status", "review_note", "reviewed_at", "created_at")
