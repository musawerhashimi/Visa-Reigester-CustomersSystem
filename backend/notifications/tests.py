"""Websocket delivery of the real-time MIS alert."""

from channels.db import database_sync_to_async
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import TransactionTestCase, override_settings
from rest_framework_simplejwt.tokens import AccessToken

from visacrm.asgi import application

from .models import Notification
from .services import notify

User = get_user_model()

CLOSE_UNAUTHENTICATED = 4401


@override_settings(
    CHANNEL_LAYERS={"default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}}
)
class NotificationSocketTests(TransactionTestCase):
    async def connect(self, token):
        communicator = WebsocketCommunicator(
            application, f"/ws/notifications/?token={token}"
        )
        connected, _ = await communicator.connect()
        return communicator, connected

    async def test_socket_rejects_a_missing_token(self):
        communicator = WebsocketCommunicator(application, "/ws/notifications/")
        connected, code = await communicator.connect()

        self.assertFalse(connected)
        self.assertEqual(code, CLOSE_UNAUTHENTICATED)
        await communicator.disconnect()

    async def test_socket_rejects_a_garbage_token(self):
        communicator, connected = await self.connect("not-a-real-token")

        self.assertFalse(connected)
        await communicator.disconnect()

    async def test_authenticated_user_receives_their_notification(self):
        user = await database_sync_to_async(User.objects.create_user)(
            email="officer@socket.test",
            password="StrongPass2026!",
            role=User.Role.VISA_OFFICER,
        )
        token = str(AccessToken.for_user(user))

        communicator, connected = await self.connect(token)
        self.assertTrue(connected)

        handshake = await communicator.receive_json_from()
        self.assertEqual(handshake["type"], "connected")
        self.assertEqual(handshake["user_id"], user.pk)

        await database_sync_to_async(notify)(
            user,
            category=Notification.Category.NEW_APPLICATION,
            title="New visa application",
            message="Ahmad Khan — Student Visa",
            play_sound=True,
        )

        event = await communicator.receive_json_from(timeout=3)
        self.assertEqual(event["type"], "notification")
        self.assertEqual(event["notification"]["title"], "New visa application")
        # The alert sound is what makes this notification urgent in the MIS.
        self.assertTrue(event["notification"]["play_sound"])

        await communicator.disconnect()

    async def test_notification_is_not_delivered_to_another_user(self):
        recipient = await database_sync_to_async(User.objects.create_user)(
            email="recipient@socket.test", password="StrongPass2026!"
        )
        eavesdropper = await database_sync_to_async(User.objects.create_user)(
            email="other@socket.test", password="StrongPass2026!"
        )

        communicator, connected = await self.connect(
            str(AccessToken.for_user(eavesdropper))
        )
        self.assertTrue(connected)
        await communicator.receive_json_from()  # handshake

        await database_sync_to_async(notify)(
            recipient,
            category=Notification.Category.NEW_APPLICATION,
            title="Not for you",
        )

        self.assertTrue(await communicator.receive_nothing(timeout=1))
        await communicator.disconnect()

    async def test_ping_is_answered(self):
        user = await database_sync_to_async(User.objects.create_user)(
            email="ping@socket.test", password="StrongPass2026!"
        )
        communicator, connected = await self.connect(str(AccessToken.for_user(user)))
        self.assertTrue(connected)
        await communicator.receive_json_from()  # handshake

        await communicator.send_json_to({"type": "ping"})
        response = await communicator.receive_json_from(timeout=3)

        self.assertEqual(response["type"], "pong")
        await communicator.disconnect()
