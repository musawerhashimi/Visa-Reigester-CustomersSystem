from django.contrib.auth import get_user_model
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView

from . import password_reset
from .models import LoginHistory
from .serializers import (
    ChangePasswordSerializer,
    ForgotPasswordSerializer,
    LoginHistorySerializer,
    LoginSerializer,
    RegistrationSerializer,
    UserSerializer,
)

User = get_user_model()


class RegisterView(generics.CreateAPIView):
    """Public customer signup."""

    serializer_class = RegistrationSerializer
    permission_classes = (permissions.AllowAny,)
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "anon"

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {
                "user": UserSerializer(user).data,
                "detail": "Account created. Please verify your email address.",
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer
    permission_classes = (permissions.AllowAny,)
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "login"


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user


class ChangePasswordView(APIView):
    def post(self, request):
        serializer = ChangePasswordSerializer(
            data=request.data, context={"request": request}
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({"detail": "Password updated."})


class ForgotPasswordView(APIView):
    """Issue a new password and email it, for someone locked out.

    Answers the same way whether or not the address exists. A different
    response would turn this into a way to discover who holds an account —
    and for a visa consultancy, knowing that someone is a customer is itself
    sensitive.
    """

    permission_classes = (permissions.AllowAny,)
    # Rate limited: each request changes a real password, so an unthrottled
    # endpoint would let anyone lock a customer out by spamming their address.
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = "forgot_password"

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"]

        user = User.objects.filter(email__iexact=email, is_active=True).first()
        if user is not None:
            password_reset.reset_password(user, request=request)

        return Response(
            {
                "detail": (
                    "If that address has an account, a new password is on "
                    "its way."
                )
            }
        )


class LoginHistoryView(generics.ListAPIView):
    serializer_class = LoginHistorySerializer

    def get_queryset(self):
        return LoginHistory.objects.filter(user=self.request.user)
