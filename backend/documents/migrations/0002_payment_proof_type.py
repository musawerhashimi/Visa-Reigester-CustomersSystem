from django.db import migrations

PAYMENT_PROOF = "payment-proof"


def create_payment_proof_type(apps, schema_editor):
    """The document a customer uploads to prove they paid a bill.

    It lives in the ordinary document system so staff review it on the screen
    they already use, and it is created here rather than in the demo seed
    because every install needs it for the payment flow to work.
    """
    DocumentType = apps.get_model("documents", "DocumentType")
    DocumentType.objects.update_or_create(
        code=PAYMENT_PROOF,
        defaults={
            "name": {
                "en": "Payment Proof",
                "de": "Zahlungsnachweis",
                "tr": "Ödeme Belgesi",
            },
            "description": {
                "en": "Bank slip, transfer confirmation or photo of your payment.",
                "de": "Überweisungsbeleg oder Foto Ihrer Zahlung.",
                "tr": "Banka dekontu veya ödemenizin fotoğrafı.",
            },
            # Sorted after the visa paperwork, which is filled in first.
            "display_order": 100,
        },
    )


def remove_payment_proof_type(apps, schema_editor):
    DocumentType = apps.get_model("documents", "DocumentType")
    # Uploaded proofs reference the type, so this only removes an unused one.
    DocumentType.objects.filter(code=PAYMENT_PROOF, documents__isnull=True).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("documents", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(create_payment_proof_type, remove_payment_proof_type),
    ]
