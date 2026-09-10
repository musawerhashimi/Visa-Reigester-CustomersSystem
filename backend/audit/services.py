"""Writing audit entries.

Every call site passes the acting user explicitly rather than reaching for
thread-local request state, so background jobs and management commands record
honestly as 'system' instead of borrowing whoever logged in last.
"""

from .models import AuditLog


def client_ip(request):
    if request is None:
        return None
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def record(
    *,
    action,
    module,
    actor=None,
    record_id="",
    record_label="",
    field_name="",
    old_value="",
    new_value="",
    description="",
    request=None,
):
    return AuditLog.objects.create(
        actor=actor,
        actor_label=(actor.get_full_name() or actor.email) if actor else "system",
        action=action,
        module=module,
        record_id=str(record_id),
        record_label=record_label,
        field_name=field_name,
        old_value=str(old_value),
        new_value=str(new_value),
        description=description,
        ip_address=client_ip(request),
        user_agent=(request.META.get("HTTP_USER_AGENT", "")[:400] if request else ""),
    )
