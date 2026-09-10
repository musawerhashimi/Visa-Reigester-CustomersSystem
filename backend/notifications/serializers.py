from rest_framework import serializers

from .models import Message, Notification


class NotificationSerializer(serializers.ModelSerializer):
    is_read = serializers.BooleanField(read_only=True)

    class Meta:
        model = Notification
        fields = (
            "id",
            "category",
            "title",
            "message",
            "reference_number",
            "link",
            "is_read",
            "play_sound",
            "created_at",
        )
        read_only_fields = fields


class MessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = (
            "id",
            "application",
            "body",
            "from_customer",
            "sender_name",
            "read_at",
            "created_at",
        )
        read_only_fields = ("id", "from_customer", "sender_name", "read_at", "created_at")

    def get_sender_name(self, obj):
        if obj.sender is None:
            return None
        return obj.sender.get_full_name() or obj.sender.email
