"""Translatable content stored as a single JSON blob per field.

Public-site content is authored in three languages; the MIS itself is
English-only. A translatable field holds {"en": ..., "de": ..., "tr": ...}
and is returned to the frontend in exactly that shape, so the React side can
pick the active locale without a second request.
"""

from django.core.exceptions import ValidationError
from django.db import models

LANGUAGES = ("en", "de", "tr")
DEFAULT_LANGUAGE = "en"


def empty_translation():
    return {lang: "" for lang in LANGUAGES}


def translate(value, language=DEFAULT_LANGUAGE):
    """Read one language out of a translatable value, falling back to English."""
    if not isinstance(value, dict):
        return value or ""
    text = value.get(language)
    if text:
        return text
    return value.get(DEFAULT_LANGUAGE, "")


class TranslatedField(models.JSONField):
    """A JSON field constrained to the {en, de, tr} shape.

    English is required because it is the fallback every other language
    resolves to; German and Turkish may be filled in later by the CMS editor.
    """

    def __init__(self, *args, **kwargs):
        kwargs.setdefault("default", empty_translation)
        super().__init__(*args, **kwargs)

    def validate(self, value, model_instance):
        super().validate(value, model_instance)
        if not isinstance(value, dict):
            raise ValidationError("Translatable value must be an object.")

        unknown = set(value) - set(LANGUAGES)
        if unknown:
            raise ValidationError(
                f"Unsupported language(s): {', '.join(sorted(unknown))}. "
                f"Expected any of {', '.join(LANGUAGES)}."
            )

        for lang, text in value.items():
            if not isinstance(text, str):
                raise ValidationError(f"Translation for '{lang}' must be a string.")

        if self.blank:
            return
        if not translate(value):
            raise ValidationError(
                f"A '{DEFAULT_LANGUAGE}' translation is required as the fallback."
            )
