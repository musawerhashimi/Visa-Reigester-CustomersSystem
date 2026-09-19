"""PDF generation for receipts and official documents.

ReportLab rather than an HTML-to-PDF engine: those need Cairo and Pango
installed on the host, which makes deployment fragile for two document types
whose layout is fixed. Everything here is pure Python.

Company details come from the CMS so the office can change its own letterhead
without a deploy.
"""

import io
from datetime import datetime

from django.conf import settings
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

# Matches the brand navy and amber used across the web interface, converted
# from the oklch tokens so print and screen read as one system.
BRAND = colors.HexColor("#1e3a6d")
BRAND_LIGHT = colors.HexColor("#eef2f9")
ACCENT = colors.HexColor("#c8811f")
INK = colors.HexColor("#26292f")
INK_MUTED = colors.HexColor("#6b7280")
RULE = colors.HexColor("#d8dce3")
SUCCESS = colors.HexColor("#1f8a53")

PAGE_MARGIN = 18 * mm


def _styles():
    sheet = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "title",
            parent=sheet["Title"],
            fontName="Helvetica-Bold",
            fontSize=20,
            leading=24,
            textColor=BRAND,
            spaceAfter=2,
        ),
        "heading": ParagraphStyle(
            "heading",
            parent=sheet["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=14,
            textColor=INK,
            spaceBefore=10,
            spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "body",
            parent=sheet["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=15,
            textColor=INK,
        ),
        "muted": ParagraphStyle(
            "muted",
            parent=sheet["BodyText"],
            fontName="Helvetica",
            fontSize=9,
            leading=13,
            textColor=INK_MUTED,
        ),
        "right": ParagraphStyle(
            "right",
            parent=sheet["BodyText"],
            fontName="Helvetica",
            fontSize=9,
            leading=13,
            textColor=INK_MUTED,
            alignment=TA_RIGHT,
        ),
        "centre": ParagraphStyle(
            "centre",
            parent=sheet["BodyText"],
            fontName="Helvetica",
            fontSize=10,
            leading=15,
            textColor=INK,
            alignment=TA_CENTER,
        ),
        "stamp": ParagraphStyle(
            "stamp",
            parent=sheet["Title"],
            fontName="Helvetica-Bold",
            fontSize=15,
            leading=19,
            textColor=SUCCESS,
            alignment=TA_CENTER,
        ),
    }


def _company():
    """Letterhead details, read from the CMS with sane fallbacks."""
    from cms.models import CompanyInfo
    from core.i18n import translate

    info = CompanyInfo.load()
    return {
        "name": translate(info.name) or getattr(settings, "COMPANY_NAME", "VisaCare"),
        "address": info.address or "",
        "phone": info.phone or "",
        "email": info.email or getattr(settings, "DEFAULT_FROM_EMAIL", ""),
        "website": info.website or "",
        "logo": info.logo,
    }


def _letterhead(styles, company, document_label):
    """Logo (when set) and company details on the left, document type right."""
    left = []
    if company["logo"]:
        try:
            left.append(Image(company["logo"].path, width=32 * mm, height=32 * mm, kind="proportional"))
            left.append(Spacer(1, 4))
        except Exception:
            # A missing or unreadable logo file must not stop the document
            # from being produced.
            pass

    left.append(Paragraph(f"<b>{company['name']}</b>", styles["body"]))
    for line in (company["address"], company["phone"], company["email"]):
        if line:
            left.append(Paragraph(line, styles["muted"]))

    right = [
        Paragraph(document_label.upper(), styles["right"]),
        Paragraph(datetime.now().strftime("%d %B %Y"), styles["right"]),
    ]

    table = Table([[left, right]], colWidths=[110 * mm, 64 * mm])
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ("LINEBELOW", (0, 0), (-1, -1), 1, BRAND),
            ]
        )
    )
    return table


def _detail_table(rows, styles, label_width=48 * mm):
    """Label/value pairs with a light rule between them."""
    data = [
        [Paragraph(label, styles["muted"]), Paragraph(str(value or "—"), styles["body"])]
        for label, value in rows
    ]
    table = Table(data, colWidths=[label_width, 174 * mm - label_width])
    table.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LINEBELOW", (0, 0), (-1, -2), 0.5, RULE),
            ]
        )
    )
    return table


def _footer(canvas, doc):
    """Page number and a note that the document was generated, not signed."""
    canvas.saveState()
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(INK_MUTED)
    canvas.drawString(
        PAGE_MARGIN,
        12 * mm,
        "This document was generated electronically and is valid without a signature.",
    )
    canvas.drawRightString(A4[0] - PAGE_MARGIN, 12 * mm, f"Page {canvas.getPageNumber()}")
    canvas.restoreState()


def _build(story, title):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=PAGE_MARGIN,
        rightMargin=PAGE_MARGIN,
        topMargin=16 * mm,
        bottomMargin=20 * mm,
        title=title,
        author=_company()["name"],
    )
    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    buffer.seek(0)
    return buffer


def render_receipt(receipt):
    """Payment bill or receipt (section 35).

    One template serves both: while the payment is unpaid this is a request
    for money and says so, naming the account to pay into; once settled the
    same document becomes proof of payment.
    """
    from core.i18n import translate

    styles = _styles()
    company = _company()
    payment = receipt.payment
    application = receipt.application
    customer = application.customer
    is_bill = receipt.is_bill

    label = "Bill" if is_bill else "Receipt"
    fee = payment.get_kind_display()

    rows = [
        ("Customer", application.full_name),
        ("Customer reference", customer.customer_code),
        ("Application", application.application_number),
        (
            "Service",
            f"{translate(application.visa_type.country.name)} "
            f"{translate(application.visa_type.name)}",
        ),
        ("Fee", fee),
    ]
    if is_bill:
        # A bill is useless without somewhere to send the money.
        rows.append(("Pay into", payment.card_number or "—"))
        rows.append(("Issued", receipt.created_at.strftime("%d %B %Y")))
    else:
        rows.append(("Payment method", payment.get_method_display()))
        rows.append(("Payment date", payment.paid_at.strftime("%d %B %Y")))
        rows.append(("Reference", payment.reference or "—"))

    story = [
        _letterhead(styles, company, label),
        Spacer(1, 14),
        Paragraph(f"{fee} {label.lower()}", styles["title"]),
        Paragraph(f"{label} no. {receipt.receipt_number}", styles["muted"]),
        Spacer(1, 14),
        _detail_table(rows, styles),
        Spacer(1, 16),
    ]

    # The amount gets its own emphasised band: it is what the reader is
    # checking, and a receipt is often skimmed rather than read.
    amount_table = Table(
        [
            [
                Paragraph(
                    "<b>Amount due</b>" if is_bill else "<b>Amount paid</b>",
                    styles["body"],
                ),
                Paragraph(
                    f"<b>{payment.amount} {payment.currency}</b>",
                    ParagraphStyle(
                        "amount",
                        parent=styles["body"],
                        alignment=TA_RIGHT,
                        fontSize=14,
                        leading=18,
                        textColor=BRAND,
                    ),
                ),
            ],
            [
                Paragraph("Status", styles["muted"]),
                Paragraph(
                    payment.get_status_display(),
                    ParagraphStyle(
                        "status", parent=styles["muted"], alignment=TA_RIGHT
                    ),
                ),
            ],
        ],
        colWidths=[110 * mm, 64 * mm],
    )
    amount_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), BRAND_LIGHT),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LINEBEFORE", (0, 0), (0, -1), 3, ACCENT),
            ]
        )
    )
    story.append(amount_table)

    if payment.note:
        story += [Spacer(1, 12), Paragraph("Note", styles["heading"]),
                  Paragraph(payment.note, styles["body"])]

    if is_bill:
        story += [
            Spacer(1, 22),
            Paragraph(
                "Please upload your payment slip in the customer portal once "
                "you have paid, so we can confirm it.",
                styles["centre"],
            ),
        ]
    else:
        story += [
            Spacer(1, 22),
            Paragraph("Thank you for your payment.", styles["centre"]),
        ]

    return _build(story, f"{label} {receipt.receipt_number}")


def render_official_document(document):
    """Verification certificate or approval letter (section 36)."""
    from core.i18n import translate

    styles = _styles()
    company = _company()
    application = document.application
    is_approval = document.kind == document.Kind.APPROVAL

    label = "Approval" if is_approval else "Verification"
    stamp = "APPROVED" if is_approval else "VERIFIED"

    reviewer = document.generated_by
    reviewer_name = (
        reviewer.get_full_name() or reviewer.email if reviewer else "Authorised officer"
    )
    decided = application.decided_at if is_approval else application.verified_at

    story = [
        _letterhead(styles, company, f"{label} certificate"),
        Spacer(1, 18),
        Paragraph(document.title or f"Application {label.lower()}", styles["title"]),
        Spacer(1, 16),
    ]

    stamp_table = Table([[Paragraph(stamp, styles["stamp"])]], colWidths=[174 * mm])
    stamp_table.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 1.5, SUCCESS),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    story += [stamp_table, Spacer(1, 18)]

    story += [
        _detail_table(
            [
                ("Application", application.application_number),
                ("Customer", application.full_name),
                ("Customer reference", application.customer.customer_code),
                ("Passport number", application.passport_number or "—"),
                (
                    "Visa",
                    f"{translate(application.visa_type.country.name)} "
                    f"{translate(application.visa_type.name)}",
                ),
                ("Status", application.get_status_display()),
                (f"{label} date", decided.strftime("%d %B %Y") if decided else "—"),
                (f"{label} by", reviewer_name),
            ],
            styles,
        ),
        Spacer(1, 20),
        Paragraph(
            "This certificate confirms the status of the application named above "
            "in our records. It is issued for the applicant's reference and does "
            "not itself constitute a visa or a decision by any embassy or "
            "immigration authority.",
            styles["muted"],
        ),
    ]

    return _build(story, document.title or f"{label} certificate")
