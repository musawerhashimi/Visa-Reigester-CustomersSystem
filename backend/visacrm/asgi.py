import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "visacrm.settings")

# The Django application must be built before importing anything that touches
# models, so the consumer import stays below this line.
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from django.urls import path  # noqa: E402

from notifications.consumers import NotificationConsumer  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        # Tokens are checked inside the consumer, so no auth middleware here.
        "websocket": URLRouter(
            [path("ws/notifications/", NotificationConsumer.as_asgi())]
        ),
    }
)
