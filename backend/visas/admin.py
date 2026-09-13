from django.contrib import admin

from .models import Country, RequiredDocument, VisaCategory, VisaType


@admin.register(Country)
class CountryAdmin(admin.ModelAdmin):
    list_display = ("code", "__str__", "is_active")
    list_filter = ("is_active",)
    search_fields = ("code",)


@admin.register(VisaCategory)
class VisaCategoryAdmin(admin.ModelAdmin):
    list_display = ("slug", "__str__", "status", "display_order")
    list_filter = ("status",)
    search_fields = ("slug",)


class RequiredDocumentInline(admin.TabularInline):
    """The checklist is edited here: it only means anything beside its visa."""

    model = RequiredDocument
    extra = 1


@admin.register(VisaType)
class VisaTypeAdmin(admin.ModelAdmin):
    list_display = ("slug", "__str__", "country", "status", "is_featured")
    list_filter = ("status", "country", "category", "is_featured")
    search_fields = ("slug",)
    inlines = (RequiredDocumentInline,)
