"""Render a report as CSV, Excel or PDF (section 38).

Each exporter takes the same report dict, so a new report format is added
once in services.py and every export follows.
"""

import csv
import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from payments.pdf import BRAND, BRAND_LIGHT, INK, INK_MUTED, RULE, _styles

PAGE_MARGIN = 14 * mm


def _cell(row, column):
    value = row.get(column["key"], "")
    return "" if value is None else str(value)


def to_csv(report):
    """Excel opens UTF-8 CSV correctly only with a BOM, so one is written."""
    buffer = io.StringIO()
    writer = csv.writer(buffer)

    writer.writerow([column["label"] for column in report["columns"]])
    for row in report["rows"]:
        writer.writerow([_cell(row, column) for column in report["columns"]])

    if report.get("summary"):
        writer.writerow([])
        writer.writerow(["Summary"])
        for label, value in report["summary"].items():
            writer.writerow([label, value])

    return ("﻿" + buffer.getvalue()).encode("utf-8")


def to_xlsx(report):
    """Minimal SpreadsheetML, so no Excel library is needed at deploy time.

    Written as an .xlsx package by hand rather than adding openpyxl: the
    output is a flat table with a summary block, and the file format for that
    is small enough to emit directly.
    """
    import zipfile
    from xml.sax.saxutils import escape

    def sheet_row(values, bold=False):
        cells = []
        for index, value in enumerate(values):
            reference = f"{_column_letter(index)}"
            style = ' s="1"' if bold else ""
            if isinstance(value, (int, float)):
                cells.append(f'<c r="{reference}"{style}><v>{value}</v></c>')
            else:
                cells.append(
                    f'<c r="{reference}"{style} t="inlineStr">'
                    f"<is><t>{escape(str(value))}</t></is></c>"
                )
        return "<row>" + "".join(cells) + "</row>"

    rows = [sheet_row([column["label"] for column in report["columns"]], bold=True)]
    for row in report["rows"]:
        values = []
        for column in report["columns"]:
            raw = row.get(column["key"], "")
            values.append(_maybe_number(raw) if column.get("numeric") else raw)
        rows.append(sheet_row(values))

    if report.get("summary"):
        rows.append(sheet_row([]))
        rows.append(sheet_row(["Summary"], bold=True))
        for label, value in report["summary"].items():
            rows.append(sheet_row([label, _maybe_number(value)]))

    sheet = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f"<sheetData>{''.join(rows)}</sheetData></worksheet>"
    )

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            "</Types>",
        )
        archive.writestr(
            "_rels/.rels",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            "</Relationships>",
        )
        archive.writestr(
            "xl/workbook.xml",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>',
        )
        archive.writestr(
            "xl/_rels/workbook.xml.rels",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            "</Relationships>",
        )
        archive.writestr(
            "xl/styles.xml",
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>'
            '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
            '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>'
            '<borders count="1"><border/></borders>'
            '<cellStyleXfs count="1"><xf/></cellStyleXfs>'
            '<cellXfs count="2"><xf xfId="0"/><xf fontId="1" applyFont="1" xfId="0"/></cellXfs>'
            "</styleSheet>",
        )
        archive.writestr("xl/worksheets/sheet1.xml", sheet)

    buffer.seek(0)
    return buffer.read()


def to_pdf(report, *, date_from=None, date_to=None):
    """Landscape table with the summary above it."""
    from cms.models import CompanyInfo
    from core.i18n import translate

    styles = _styles()
    company = translate(CompanyInfo.load().name) or "VisaCare"

    story = [
        Paragraph(report["title"], styles["title"]),
        Paragraph(_range_label(date_from, date_to), styles["muted"]),
        Spacer(1, 12),
    ]

    if report.get("summary"):
        summary = Table(
            [
                [
                    Paragraph(f"<b>{label}</b>", styles["muted"]),
                    Paragraph(str(value), styles["body"]),
                ]
                for label, value in report["summary"].items()
            ],
            colWidths=[60 * mm, 60 * mm],
        )
        summary.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), BRAND_LIGHT),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("TOPPADDING", (0, 0), (-1, -1), 4),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ]
            )
        )
        story += [summary, Spacer(1, 14)]

    header = [Paragraph(f"<b>{column['label']}</b>", styles["muted"]) for column in report["columns"]]
    body = [
        [Paragraph(_cell(row, column), styles["body"]) for column in report["columns"]]
        for row in report["rows"]
    ]

    if body:
        table = Table([header] + body, repeatRows=1)
        table.setStyle(
            TableStyle(
                [
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LINEBELOW", (0, 0), (-1, 0), 1, BRAND),
                    ("LINEBELOW", (0, 1), (-1, -2), 0.4, RULE),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                    ("LEFTPADDING", (0, 0), (-1, -1), 4),
                    ("TEXTCOLOR", (0, 0), (-1, 0), INK),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BRAND_LIGHT]),
                ]
            )
        )
        story.append(table)
    else:
        story.append(Paragraph("No data for this period.", styles["muted"]))

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(INK_MUTED)
        canvas.drawString(
            PAGE_MARGIN,
            10 * mm,
            f"{company} · generated {datetime.now().strftime('%d %B %Y, %H:%M')}",
        )
        canvas.drawRightString(
            landscape(A4)[0] - PAGE_MARGIN, 10 * mm, f"Page {canvas.getPageNumber()}"
        )
        canvas.restoreState()

    buffer = io.BytesIO()
    document = SimpleDocTemplate(
        buffer,
        pagesize=landscape(A4),
        leftMargin=PAGE_MARGIN,
        rightMargin=PAGE_MARGIN,
        topMargin=14 * mm,
        bottomMargin=18 * mm,
        title=report["title"],
    )
    document.build(story, onFirstPage=footer, onLaterPages=footer)
    buffer.seek(0)
    return buffer.read()


def _range_label(date_from, date_to):
    if date_from and date_to:
        return f"From {date_from} to {date_to}"
    if date_from:
        return f"From {date_from}"
    if date_to:
        return f"Up to {date_to}"
    return "All time"


def _maybe_number(value):
    """Write numeric-looking values as numbers so Excel can total them."""
    if isinstance(value, (int, float)):
        return value
    text = str(value).strip()
    if text.endswith("%") or text in ("", "—"):
        return text
    try:
        return float(text) if "." in text else int(text)
    except ValueError:
        return text


def _column_letter(index):
    letters = ""
    index += 1
    while index:
        index, remainder = divmod(index - 1, 26)
        letters = chr(65 + remainder) + letters
    return letters


EXPORTERS = {
    "csv": (to_csv, "text/csv", "csv"),
    "xlsx": (
        to_xlsx,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "xlsx",
    ),
    "pdf": (to_pdf, "application/pdf", "pdf"),
}
