"""Staff directory, used by the MIS assignment picker."""

from django.contrib.auth import get_user_model
from rest_framework import generics

from core.permissions import IsMISUser

from .serializers import UserSerializer

User = get_user_model()

ASSIGNABLE_ROLES = (User.Role.SUPER_ADMIN, User.Role.ADMIN, User.Role.VISA_OFFICER)


class StaffListView(generics.ListAPIView):
    """Active internal accounts an application can be assigned to.

    CMS managers are excluded: they administer the public site and have no
    business owning a customer's application.
    """

    serializer_class = UserSerializer
    permission_classes = (IsMISUser,)
    pagination_class = None

    def get_queryset(self):
        return User.objects.filter(
            role__in=ASSIGNABLE_ROLES, is_active=True
        ).order_by("first_name", "last_name", "email")
