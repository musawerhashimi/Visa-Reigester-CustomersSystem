"""Websocket endpoint delivering notifications as they happen.

Browsers cannot set headers on a websocket handshake, so the JWT arrives as a
query parameter. It is verified here rather than trusted: an unauthenticated
or expired token closes the socket instead of joining a group.
"""

import logging

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.contrib.auth import get_user_model

from .services import user_group

logger = logging.getLogger(__name__)

User = get_user_model()

CLOSE_UNAUTHENTICATED = 4401


@database_sync_to_async
def _user_from_token(raw_token):
    from rest_framework_simplejwt.exceptions import TokenError
    from rest_framework_simplejwt.tokens import AccessToken

    try:
        token = AccessToken(raw_token)
        user = User.objects.filter(pk=token["user_id"], is_active=True).first()
    except (TokenError, KeyError):
        return None
    return user


class NotificationConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        raw_token = self._token_from_query()
        if not raw_token:
            await self.close(code=CLOSE_UNAUTHENTICATED)
            return

        user = await _user_from_token(raw_token)
        if user is None:
            await self.close(code=CLOSE_UNAUTHENTICATED)
            return

        self.user = user
        self.group = user_group(user.pk)
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        await self.send_json({"type": "connected", "user_id": user.pk})

    async def disconnect(self, code):
        group = getattr(self, "group", None)
        if group:
            await self.channel_layer.group_discard(group, self.channel_name)

    async def receive_json(self, content, **kwargs):
        # Heartbeat only. The socket is a delivery channel, not an API: any
        # state change goes through the REST endpoints, which are audited.
        if content.get("type") == "ping":
            await self.send_json({"type": "pong"})

    async def notification_message(self, event):
        await self.send_json({"type": "notification", "notification": event["payload"]})

    def _token_from_query(self):
        query = self.scope.get("query_string", b"").decode()
        for part in query.split("&"):
            key, _, value = part.partition("=")
            if key == "token" and value:
                return value
        return None
