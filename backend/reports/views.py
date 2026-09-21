from django.http import HttpResponse
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from accounts import permissions as perms
from audit import services as audit
from branches.scoping import sees_all_branches
from core.permissions import IsMISUser

from . import services
from .exporters import EXPORTERS


class ReportViewSet(viewsets.ViewSet):
    """Reporting and exports (sections 37 and 38)."""

    permission_classes = (IsMISUser,)

    def list(self, request):
        """The reports this user may run."""
        if not request.user.has_perm_slug(perms.REPORTS_VIEW):
            raise PermissionDenied("You cannot view reports.")

        return Response(
            {
                "reports": [
                    {"key": "applications", "label": "Applications by status"},
                    {"key": "visas", "label": "Applications by country or visa"},
                    {"key": "processing-time", "label": "Processing time"},
                    {"key": "customers", "label": "Customers"},
                    {"key": "financial", "label": "Financial"},
                    {"key": "over-time", "label": "Applications over time"},
                    {"key": "emails", "label": "Email traffic"},
                ],
                "formats": list(EXPORTERS),
                "can_export": request.user.has_perm_slug(perms.REPORTS_EXPORT),
            }
        )

    def retrieve(self, request, pk=None):
        """Run one report and return its rows as JSON."""
        if not request.user.has_perm_slug(perms.REPORTS_VIEW):
            raise PermissionDenied("You cannot view reports.")

        report = self._build(pk, request)
        return Response(report)

    @action(detail=True, methods=["get"])
    def export(self, request, pk=None):
        """Download a report as CSV, Excel or PDF."""
        if not request.user.has_perm_slug(perms.REPORTS_EXPORT):
            raise PermissionDenied("You cannot export reports.")

        fmt = request.query_params.get("export_format", "csv").lower()
        if fmt not in EXPORTERS:
            raise ValidationError(
                {
                    "export_format": (
                        f"Unsupported format. Choose one of: {', '.join(EXPORTERS)}."
                    )
                }
            )

        report = self._build(pk, request)
        renderer, content_type, extension = EXPORTERS[fmt]

        options = self._options(request)
        if fmt == "pdf":
            content = renderer(
                report,
                date_from=options.get("date_from"),
                date_to=options.get("date_to"),
            )
        else:
            content = renderer(report)

        # Exports leave the system with customer data in them, so who took
        # what is recorded (section 46).
        audit.record(
            action="export",
            module="reports",
            actor=request.user,
            record_id=pk,
            record_label=report["title"],
            description=f"Exported as {fmt}.",
            request=request,
        )

        filename = f"{pk}-report.{extension}"
        response = HttpResponse(content, content_type=content_type)
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response

    def _options(self, request):
        params = request.query_params
        return {
            "date_from": params.get("date_from") or None,
            "date_to": params.get("date_to") or None,
            "group": params.get("group") or "country",
            "interval": params.get("interval") or "month",
            "branch": self._branch(request),
        }

    def _branch(self, request):
        """Which branch this report covers; None means the whole company.

        A branch user is pinned to their own office whatever they ask for, so
        a hand-written query string cannot read another branch's figures.
        """
        user = request.user
        if not sees_all_branches(user):
            return user.branch_id
        requested = request.query_params.get("branch")
        return int(requested) if requested and requested.isdigit() else None

    def _build(self, name, request):
        try:
            return services.build(name, **self._options(request))
        except KeyError as error:
            raise ValidationError({"report": f"Unknown report '{name}'."}) from error
        except ValueError as error:
            # A malformed date should say so rather than surfacing as a 500.
            raise ValidationError({"date": "Use the format YYYY-MM-DD."}) from error
