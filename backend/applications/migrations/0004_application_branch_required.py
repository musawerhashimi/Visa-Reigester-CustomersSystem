import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    """Enforce the branch FK, once 0002_general_branch has backfilled it."""

    dependencies = [
        ("branches", "0002_general_branch"),
        ("applications", "0003_application_branch"),
    ]

    operations = [
        migrations.AlterField(
            model_name="application",
            name="branch",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="applications",
                to="branches.branch",
            ),
        ),
    ]
