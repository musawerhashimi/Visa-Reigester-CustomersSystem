from django.db import migrations

#: Phrases that promise the portal without saying where it is, paired with the
#: same sentence carrying a link. Email is read away from the app, so "your
#: customer portal" on its own leaves the customer with nowhere to click.
REPLACEMENTS = (
    (
        "Please upload it through your customer portal.",
        "Please upload it here:\n{{application_url}}",
    ),
    (
        "Please upload a new copy through your customer portal.",
        "Please upload a new copy here:\n{{application_url}}",
    ),
    (
        "Our team will review your application and contact you if anything "
        "further is required.",
        "Our team will review your application and contact you if anything "
        "further is required.\n\nYou can follow its progress here:\n"
        "{{application_url}}",
    ),
    (
        "Your visa application has successfully passed the verification stage "
        "and is now being processed.",
        "Your visa application has successfully passed the verification stage "
        "and is now being processed.\n\nFollow its progress here:\n"
        "{{application_url}}",
    ),
    (
        "We are pleased to inform you that your application has been approved.",
        "We are pleased to inform you that your application has been "
        "approved.\n\nYour documents are available here:\n{{application_url}}",
    ),
    (
        "Your document '{{document_name}}' has been verified.",
        "Your document '{{document_name}}' has been verified.\n\n"
        "See your application here:\n{{application_url}}",
    ),
)


def add_links(apps, schema_editor):
    """Put a real link into templates that still only mention the portal.

    Only the exact seeded sentences are rewritten, and a template that already
    carries a link is skipped, so wording the office has edited is left alone.
    """
    EmailTemplate = apps.get_model("emails", "EmailTemplate")

    for template in EmailTemplate.objects.all():
        if "{{application_url}}" in (template.body or ""):
            continue

        body = template.body or ""
        changed = False
        for old, new in REPLACEMENTS:
            if old in body:
                body = body.replace(old, new)
                changed = True

        if changed:
            template.body = body
            template.save(update_fields=["body"])


def remove_links(apps, schema_editor):
    EmailTemplate = apps.get_model("emails", "EmailTemplate")

    for template in EmailTemplate.objects.all():
        body = template.body or ""
        if "{{application_url}}" not in body:
            continue
        for old, new in REPLACEMENTS:
            body = body.replace(new, old)
        template.body = body
        template.save(update_fields=["body"])


class Migration(migrations.Migration):
    dependencies = [
        ("emails", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(add_links, remove_links),
    ]
