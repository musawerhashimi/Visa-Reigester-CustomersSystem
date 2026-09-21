"""Report aggregation.

Every report is a dict of plain rows plus a summary, so the same result can
be rendered as JSON for the dashboard, CSV, Excel or PDF without each format
re-querying the database.
"""

from datetime import date, datetime, time

from django.db.models import Avg, Count, DurationField, ExpressionWrapper, F, Sum
from django.db.models.functions import TruncDay, TruncMonth, TruncWeek, TruncYear
from django.utils import timezone

from applications.models import Application, ApplicationStatus
from cms.models import ContactMessage
from customers.models import CustomerProfile
from emails.models import EmailLog
from payments.models import Payment

TRUNCATORS = {
    "day": TruncDay,
    "week": TruncWeek,
    "month": TruncMonth,
    "year": TruncYear,
}

# Outcomes that count as a decision when computing success rates.
DECIDED = (ApplicationStatus.APPROVED, ApplicationStatus.COMPLETED, ApplicationStatus.REJECTED)
SUCCESSFUL = (ApplicationStatus.APPROVED, ApplicationStatus.COMPLETED)


def parse_range(date_from=None, date_to=None):
    """Interpret a report's date range inclusively.

    A user asking for 01–30 September means the whole of the 30th, so the end
    date is widened to the end of that day rather than midnight at its start.
    """
    start = _as_datetime(date_from, time.min)
    end = _as_datetime(date_to, time.max)
    return start, end


def _as_datetime(value, at_time):
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, date):
        parsed = datetime.combine(value, at_time)
    else:
        parsed = datetime.combine(date.fromisoformat(str(value)), at_time)

    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed)
    return parsed


def _for_branch(queryset, branch, field="branch"):
    """Limit a report to one branch, or leave it whole for the general one.

    `branch` is the id the view resolved from the caller: None means this user
    sees every branch, so the report covers the whole company.
    """
    if branch is None:
        return queryset
    return queryset.filter(**{field: branch})


def _within(queryset, field, start, end):
    if start:
        queryset = queryset.filter(**{f"{field}__gte": start})
    if end:
        queryset = queryset.filter(**{f"{field}__lte": end})
    return queryset


def applications_report(*, date_from=None, date_to=None, branch=None, **_):
    """Applications by status, with the counts section 37 asks for."""
    start, end = parse_range(date_from, date_to)
    queryset = _within(
        _for_branch(Application.objects.alive(), branch), "created_at", start, end
    )

    counts = dict(
        queryset.values_list("status").annotate(total=Count("id")).values_list("status", "total")
    )
    labels = dict(ApplicationStatus.choices)

    rows = [
        {"status": labels.get(status, status), "count": counts.get(status, 0)}
        for status, _ in ApplicationStatus.choices
        if counts.get(status)
    ]

    total = sum(counts.values())
    decided = sum(counts.get(status, 0) for status in DECIDED)
    successful = sum(counts.get(status, 0) for status in SUCCESSFUL)

    return {
        "title": "Applications report",
        "columns": [
            {"key": "status", "label": "Status"},
            {"key": "count", "label": "Applications", "numeric": True},
        ],
        "rows": rows,
        "summary": {
            "Total applications": total,
            "Decided": decided,
            "Approved": successful,
            "Rejected": counts.get(ApplicationStatus.REJECTED, 0),
            "Success rate": _percentage(successful, decided),
        },
    }


def visa_report(*, date_from=None, date_to=None, group="country", branch=None, **_):
    """Applications by destination country or visa type, with success rates."""
    from core.i18n import translate

    start, end = parse_range(date_from, date_to)
    queryset = _within(Application.objects.alive(), "created_at", start, end)

    label = "Visa type" if group == "type" else "Country"

    buckets = {}
    for application in queryset.select_related("visa_type__country"):
        bucket = (
            translate(application.visa_type.name)
            if group == "type"
            else translate(application.visa_type.country.name)
        )
        entry = buckets.setdefault(bucket, {"total": 0, "approved": 0, "rejected": 0})
        entry["total"] += 1
        if application.status in SUCCESSFUL:
            entry["approved"] += 1
        elif application.status == ApplicationStatus.REJECTED:
            entry["rejected"] += 1

    rows = [
        {
            "name": name,
            "total": data["total"],
            "approved": data["approved"],
            "rejected": data["rejected"],
            "success_rate": _percentage(
                data["approved"], data["approved"] + data["rejected"]
            ),
        }
        for name, data in sorted(
            buckets.items(), key=lambda item: item[1]["total"], reverse=True
        )
    ]

    total = sum(data["total"] for data in buckets.values())
    approved = sum(data["approved"] for data in buckets.values())
    rejected = sum(data["rejected"] for data in buckets.values())

    return {
        "title": f"Applications by {label.lower()}",
        "columns": [
            {"key": "name", "label": label},
            {"key": "total", "label": "Applications", "numeric": True},
            {"key": "approved", "label": "Approved", "numeric": True},
            {"key": "rejected", "label": "Rejected", "numeric": True},
            {"key": "success_rate", "label": "Success rate", "numeric": True},
        ],
        "rows": rows,
        "summary": {
            "Total applications": total,
            "Approved": approved,
            "Rejected": rejected,
            "Success rate": _percentage(approved, approved + rejected),
        },
    }


def processing_time_report(*, date_from=None, date_to=None, branch=None, **_):
    """How long decided applications took, per section 37."""
    start, end = parse_range(date_from, date_to)

    queryset = _within(
        _for_branch(
            Application.objects.alive().filter(
                submitted_at__isnull=False, decided_at__isnull=False
            ),
            branch,
        ),
        "decided_at",
        start,
        end,
    ).annotate(
        duration=ExpressionWrapper(
            F("decided_at") - F("submitted_at"), output_field=DurationField()
        )
    )

    rows = [
        {
            "application": application.application_number,
            "customer": application.full_name,
            "submitted": application.submitted_at.date().isoformat(),
            "decided": application.decided_at.date().isoformat(),
            "days": round(application.duration.total_seconds() / 86400, 1),
            "outcome": application.get_status_display(),
        }
        for application in queryset.order_by("-decided_at")
    ]

    average = queryset.aggregate(value=Avg("duration"))["value"]
    average_days = round(average.total_seconds() / 86400, 1) if average else 0

    return {
        "title": "Processing time report",
        "columns": [
            {"key": "application", "label": "Application"},
            {"key": "customer", "label": "Customer"},
            {"key": "submitted", "label": "Submitted"},
            {"key": "decided", "label": "Decided"},
            {"key": "days", "label": "Days", "numeric": True},
            {"key": "outcome", "label": "Outcome"},
        ],
        "rows": rows,
        "summary": {
            "Applications decided": len(rows),
            "Average days": average_days,
            "Fastest": min((row["days"] for row in rows), default=0),
            "Slowest": max((row["days"] for row in rows), default=0),
        },
    }


def customers_report(*, date_from=None, date_to=None, branch=None, **_):
    """Customers by country, with how many have applied."""
    start, end = parse_range(date_from, date_to)
    queryset = _within(
        _for_branch(
            CustomerProfile.objects.alive(), branch, field="applications__branch"
        ),
        "created_at",
        start,
        end,
    )
    if branch is not None:
        queryset = queryset.distinct()

    buckets = (
        queryset.values("country")
        .annotate(total=Count("id"), applications=Count("applications"))
        .order_by("-total")
    )

    rows = [
        {
            "country": bucket["country"] or "Not stated",
            "customers": bucket["total"],
            "applications": bucket["applications"],
        }
        for bucket in buckets
    ]

    total = queryset.count()
    active = queryset.filter(status=CustomerProfile.Status.ACTIVE).count()

    return {
        "title": "Customers report",
        "columns": [
            {"key": "country", "label": "Country"},
            {"key": "customers", "label": "Customers", "numeric": True},
            {"key": "applications", "label": "Applications", "numeric": True},
        ],
        "rows": rows,
        "summary": {
            "Total customers": total,
            "Active": active,
            "Inactive": total - active,
            "With applications": queryset.filter(applications__isnull=False)
            .distinct()
            .count(),
        },
    }


def financial_report(*, date_from=None, date_to=None, branch=None, **_):
    """Payments recorded in the period, grouped by status (section 37)."""
    start, end = parse_range(date_from, date_to)
    queryset = _within(
        _for_branch(Payment.objects.all(), branch, field="application__branch"),
        "paid_at",
        start,
        end,
    )

    buckets = (
        queryset.values("status", "currency")
        .annotate(total=Sum("amount"), count=Count("id"))
        .order_by("status")
    )

    labels = dict(Payment.Status.choices)
    rows = [
        {
            "status": labels.get(bucket["status"], bucket["status"]),
            "currency": bucket["currency"],
            "payments": bucket["count"],
            "amount": _money(bucket["total"]),
        }
        for bucket in buckets
    ]

    paid = queryset.filter(status=Payment.Status.PAID).aggregate(
        total=Sum("amount"), count=Count("id")
    )

    return {
        "title": "Financial report",
        "columns": [
            {"key": "status", "label": "Status"},
            {"key": "currency", "label": "Currency"},
            {"key": "payments", "label": "Payments", "numeric": True},
            {"key": "amount", "label": "Amount", "numeric": True},
        ],
        "rows": rows,
        "summary": {
            "Payments recorded": queryset.count(),
            "Settled payments": paid["count"] or 0,
            "Total received": _money(paid["total"]),
        },
    }


def applications_over_time(
    *, date_from=None, date_to=None, interval="month", branch=None, **_
):
    """Volume per period, for the dashboard chart (section 20)."""
    truncator = TRUNCATORS.get(interval, TruncMonth)
    start, end = parse_range(date_from, date_to)

    queryset = _within(
        _for_branch(Application.objects.alive(), branch), "created_at", start, end
    )
    buckets = (
        queryset.annotate(period=truncator("created_at"))
        .values("period")
        .annotate(total=Count("id"))
        .order_by("period")
    )

    rows = [
        {
            "period": bucket["period"].date().isoformat() if bucket["period"] else "",
            "applications": bucket["total"],
        }
        for bucket in buckets
    ]

    return {
        "title": f"Applications per {interval}",
        "columns": [
            {"key": "period", "label": "Period"},
            {"key": "applications", "label": "Applications", "numeric": True},
        ],
        "rows": rows,
        "summary": {
            "Periods": len(rows),
            "Total applications": sum(row["applications"] for row in rows),
            "Busiest period": max(
                (row["period"] for row in rows),
                key=lambda period: next(
                    row["applications"] for row in rows if row["period"] == period
                ),
                default="—",
            ),
        },
    }


def emails_report(*, date_from=None, date_to=None, branch=None, **_):
    """Email traffic both ways: what we sent, and what customers sent us.

    Outbound is scoped through the application, which is where every email
    inherits its branch from. Inbound is the public contact form, which has
    no branch at all — nobody picks an office to write to — so it is counted
    only for the general branch and reported as such rather than silently
    dropped or duplicated into every office's figures.
    """
    start, end = parse_range(date_from, date_to)

    sent = _within(
        _for_branch(EmailLog.objects.all(), branch, field="application__branch"),
        "created_at",
        start,
        end,
    )

    statuses = dict(EmailLog.Status.choices)
    by_status = {
        bucket["status"]: bucket["total"]
        for bucket in sent.values("status").annotate(total=Count("id"))
    }
    total_sent = sum(by_status.values())

    rows = [
        {
            "direction": "Sent to customers",
            "channel": f"Email · {statuses.get(status, status)}",
            "total": by_status.get(status, 0),
        }
        for status in (EmailLog.Status.SENT, EmailLog.Status.QUEUED, EmailLog.Status.FAILED)
    ]

    # A branch report would otherwise show the whole company's contact form.
    inbound_counted = branch is None
    received = (
        _within(ContactMessage.objects.all(), "created_at", start, end)
        if inbound_counted
        else ContactMessage.objects.none()
    )
    total_received = received.count()
    replied = received.filter(status=ContactMessage.Status.REPLIED).count()

    rows.append(
        {
            "direction": "Received from customers",
            "channel": "Contact form",
            "total": total_received,
        }
    )

    summary = {
        "Total sent to customers": total_sent,
        "Delivered": by_status.get(EmailLog.Status.SENT, 0),
        "Failed": by_status.get(EmailLog.Status.FAILED, 0),
        "Total received from customers": total_received,
        "Replied to": replied,
        "Automatic": sent.filter(is_automatic=True).count(),
        "Sent by staff": sent.filter(is_automatic=False).count(),
    }
    if not inbound_counted:
        # Said plainly, so a branch does not read 0 as "nobody wrote in".
        summary["Received from customers"] = "Company-wide only"

    return {
        "title": "Email traffic",
        "columns": [
            {"key": "direction", "label": "Direction"},
            {"key": "channel", "label": "Channel"},
            {"key": "total", "label": "Messages", "numeric": True},
        ],
        "rows": rows,
        "summary": summary,
    }


def _money(value):
    """Always two decimal places: a currency total of "750" reads as wrong."""
    from decimal import Decimal

    return str((value or Decimal("0")).quantize(Decimal("0.01")))


def _percentage(part, whole):
    if not whole:
        return "—"
    return f"{round(part / whole * 100, 1)}%"


REPORTS = {
    "applications": applications_report,
    "visas": visa_report,
    "processing-time": processing_time_report,
    "customers": customers_report,
    "financial": financial_report,
    "over-time": applications_over_time,
    "emails": emails_report,
}


def build(name, **options):
    """Run a named report. Raises KeyError for an unknown name."""
    return REPORTS[name](**options)
