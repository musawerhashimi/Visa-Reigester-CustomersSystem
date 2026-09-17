from django.db import migrations


def create_general_branch(apps, schema_editor):
    """Establish the general branch and put all existing work behind it.

    Everything that existed before branches did belongs to the head office, so
    nothing disappears from a view the day this ships.
    """
    Branch = apps.get_model("branches", "Branch")
    User = apps.get_model("accounts", "User")
    Application = apps.get_model("applications", "Application")

    general, _ = Branch.objects.get_or_create(
        is_general=True,
        defaults={"name": "General", "code": "GEN"},
    )

    User.objects.filter(branch__isnull=True).exclude(role="customer").update(
        branch=general
    )
    Application.objects.filter(branch__isnull=True).update(branch=general)


def remove_general_branch(apps, schema_editor):
    Branch = apps.get_model("branches", "Branch")
    Branch.objects.filter(is_general=True).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("branches", "0001_initial"),
        ("accounts", "0002_user_branch"),
        ("applications", "0003_application_branch"),
    ]

    operations = [
        migrations.RunPython(create_general_branch, remove_general_branch),
    ]
