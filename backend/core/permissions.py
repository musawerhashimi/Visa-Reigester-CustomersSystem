"""DRF permission classes over the slug-based permission scheme."""

from rest_framework import permissions


class HasPermissionSlug(permissions.BasePermission):
    """Require a permission slug named by the view.

    Views set `required_permission`, or `required_permissions` as a mapping of
    HTTP method to slug when reading and writing differ.
    """

    message = "You do not have permission to perform this action."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False

        slug = getattr(view, "required_permissions", {}).get(request.method) or getattr(
            view, "required_permission", None
        )
        if slug is None:
            return True
        return user.has_perm_slug(slug)


class IsCustomer(permissions.BasePermission):
    message = "This area is for customer accounts."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_customer)


class IsMISUser(permissions.BasePermission):
    """Any internal account. Customers never reach the MIS."""

    message = "This area is for company staff."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.is_mis_user)


class IsOwnerOrMIS(permissions.BasePermission):
    """Object-level guard: a customer touches only their own records.

    Objects expose `customer.user_id`, so this covers applications, documents
    and payments alike.
    """

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_mis_user:
            return True

        owner_id = getattr(getattr(obj, "customer", None), "user_id", None)
        if owner_id is None:
            application = getattr(obj, "application", None)
            owner_id = getattr(getattr(application, "customer", None), "user_id", None)
        return owner_id == user.id
