"""Creating notifications and pushing them to connected clients.

A notification is always persisted first, then pushed. The websocket is a
convenience for whoever happens to be watching; the notification centre is the
source of truth, so a staff member who was offline still sees what happened.
"""

import logging

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.contrib.auth import get_user_model
from django.db import models

from .models import Notification

logger = logging.getLogger(__name__)

User = get_user_model()

# Roles that should hear about a new application landing.
MIS_ALERT_ROLES = (User.Role.SUPER_ADMIN, User.Role.ADMIN, User.Role.VISA_OFFICER)


def user_group(user_id):
    return f"notify.user.{user_id}"


def serialize(notification):
    return {
        "id": notification.id,
        "category": notification.category,
        "title": notification.title,
        "message": notification.message,
        "reference_number": notification.reference_number,
        "link": notification.link,
        "is_read": notification.is_read,
        "play_sound": notification.play_sound,
        "created_at": notification.created_at.isoformat(),
    }


def push(notification):
    """Send one notification over the websocket, if a layer is configured.

    A transport failure must never roll back the work that triggered it, so
    this logs and moves on rather than raising.
    """
    layer = get_channel_layer()
    if layer is None:
        return
    try:
        async_to_sync(layer.group_send)(
            user_group(notification.recipient_id),
            {"type": "notification.message", "payload": serialize(notification)},
        )
    except Exception:
        logger.exception(
            "Failed to push notification %s to user %s",
            notification.id,
            notification.recipient_id,
        )


def notify(
    recipient,
    *,
    category,
    title,
    message="",
    application=None,
    link="",
    play_sound=False,
):
    notification = Notification.objects.create(
        recipient=recipient,
        category=category,
        title=title,
        message=message,
        application=application,
        reference_number=application.application_number if application else "",
        link=link,
        play_sound=play_sound,
    )
    push(notification)
    return notification


def notify_mis(*, category, title, message="", application=None, link="", play_sound=False):
    """Alert the staff who should act on this — the assignee, or the desk.

    Once an application has an owner, only that person is interrupted; before
    assignment the whole desk needs to see it so nothing sits unclaimed.

    "The desk" means the branch handling the application, plus the general
    branch which oversees all of them. Alerting every office would bury a
    branch's own arrivals under work it cannot even open.
    """
    if application and application.assigned_to_id:
        recipients = User.objects.filter(pk=application.assigned_to_id, is_active=True)
    else:
        recipients = User.objects.filter(role__in=MIS_ALERT_ROLES, is_active=True)
        if application is not None:
            recipients = recipients.filter(
                models.Q(branch_id=application.branch_id)
                | models.Q(branch__is_general=True)
            )

    return [
        notify(
            user,
            category=category,
            title=title,
            message=message,
            application=application,
            link=link,
            play_sound=play_sound,
        )
        for user in recipients
    ]
