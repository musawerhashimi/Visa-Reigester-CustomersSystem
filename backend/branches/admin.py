from django.contrib import admin

from .models import Branch


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ("name", "code", "is_general", "city", "is_active")
    list_filter = ("is_general", "is_active")
    search_fields = ("name", "code", "city")

    def has_delete_permission(self, request, obj=None):
        # The general branch anchors the whole partition; it is not deletable.
        if obj is not None and obj.is_general:
            return False
        return super().has_delete_permission(request, obj)
