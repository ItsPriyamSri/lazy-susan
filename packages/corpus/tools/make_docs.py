#!/usr/bin/env python3
"""
Builds the fixture folder: twelve documents and three forms.

Every document is a real PDF with a real text layer (except the two that are
deliberately photographs-of-pages, so the app has something it genuinely cannot
read). Nothing here is a mock-up of a PDF; `pdftotext` reads these the same way
it reads a bank statement you downloaded.

Run: python3 tools/make_docs.py
"""

from __future__ import annotations

import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DOCS = os.path.join(ROOT, "docs")
FORMS = os.path.join(ROOT, "forms")

PAGE_W, PAGE_H = A4  # 595 x 842 points


# --------------------------------------------------------------------------
# drawing helpers
# --------------------------------------------------------------------------

def page(c: canvas.Canvas, kicker: str, title: str) -> float:
    """Draws the top of a page and returns the y to start writing at."""
    c.setFillColor(colors.HexColor("#111111"))
    c.setFont("Helvetica-Bold", 9)
    c.drawString(56, PAGE_H - 56, kicker.upper())
    c.setFont("Helvetica-Bold", 17)
    c.drawString(56, PAGE_H - 82, title)
    c.setStrokeColor(colors.HexColor("#cccccc"))
    c.setLineWidth(0.6)
    c.line(56, PAGE_H - 94, PAGE_W - 56, PAGE_H - 94)
    return PAGE_H - 124


def rows(c: canvas.Canvas, y: float, items: list[tuple[str, str]], size: int = 11) -> float:
    for label, value in items:
        c.setFont("Helvetica", size)
        c.setFillColor(colors.HexColor("#555555"))
        c.drawString(56, y, f"{label}:")
        c.setFillColor(colors.HexColor("#111111"))
        c.setFont("Helvetica-Bold", size)
        c.drawString(210, y, value)
        y -= 22
    return y


def para(c: canvas.Canvas, y: float, text: str, width: int = 78) -> float:
    c.setFont("Helvetica", 10)
    c.setFillColor(colors.HexColor("#333333"))
    words, line = text.split(), ""
    for w in words:
        if len(line) + len(w) + 1 > width:
            c.drawString(56, y, line)
            y -= 15
            line = w
        else:
            line = f"{line} {w}".strip()
    if line:
        c.drawString(56, y, line)
        y -= 15
    return y


def footer(c: canvas.Canvas, text: str) -> None:
    c.setFont("Helvetica", 8)
    c.setFillColor(colors.HexColor("#888888"))
    c.drawString(56, 48, text)
    c.drawRightString(PAGE_W - 56, 48, "Page 1 of 1")


def save(c: canvas.Canvas, name: str) -> None:
    c.showPage()
    c.save()
    print(f"  {name}")


# --------------------------------------------------------------------------
# documents
# --------------------------------------------------------------------------

def passport() -> None:
    c = canvas.Canvas(os.path.join(DOCS, "passport.pdf"), pagesize=A4)
    y = page(c, "Republic of Testland", "PASSPORT")
    y = rows(c, y, [
        ("Full name", "PRIYAM SHARMA"),
        ("Date of birth", "14 MAR 2003"),
        ("Place of birth", "PUNE"),
        ("Nationality", "TESTLANDI"),
        ("Passport number", "T1234567"),
        ("Date of issue", "02 FEB 2022"),
        ("Date of expiry", "01 FEB 2032"),
        ("Authority", "PUNE REGIONAL OFFICE"),
    ])
    para(c, y - 16, "This passport is the property of the Republic of Testland. "
                    "If found, please return it to the nearest mission or police station.")
    footer(c, "P<TSLSHARMA<<PRIYAM<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<")
    save(c, "passport.pdf")


def marksheet_2026() -> None:
    c = canvas.Canvas(os.path.join(DOCS, "marksheet-2026.pdf"), pagesize=A4)
    y = page(c, "Testland Institute of Technology", "Statement of Grades")
    y = rows(c, y, [
        ("Student name", "PRIYAM SHARMA"),
        ("Programme", "B.Tech Computer Engineering"),
        ("Year of study", "3"),
        ("Semester", "VI"),
        ("Cumulative grade point average", "8.6"),
        ("Credits earned", "132"),
        ("Result", "PASS"),
        ("Date of issue", "30 JUN 2026"),
    ])
    y -= 10
    c.setFont("Helvetica-Bold", 10)
    c.drawString(56, y, "Semester VI subjects")
    y -= 18
    y = rows(c, y, [
        ("Operating Systems", "A"),
        ("Computer Networks", "A"),
        ("Compiler Design", "B"),
        ("Elective: Distributed Systems", "A"),
    ], size=10)
    para(c, y - 8, "This is a computer-generated statement. Verify at the controller "
                   "of examinations counter if a signed copy is required.")
    footer(c, "TIT/COE/2026/0614")
    save(c, "marksheet-2026.pdf")


def marksheet_2025() -> None:
    c = canvas.Canvas(os.path.join(DOCS, "marksheet-2025.pdf"), pagesize=A4)
    y = page(c, "Testland Institute of Technology", "Semester IV Grade Sheet")
    y = rows(c, y, [
        ("Student name", "PRIYAM SHARMA"),
        ("Programme", "B.Tech Computer Engineering"),
        ("Semester", "IV"),
        ("Credits registered", "24"),
        ("Credits earned", "22"),
        ("Result", "PASS"),
        ("Date of issue", "28 JUN 2025"),
    ])
    y -= 10
    c.setFont("Helvetica-Bold", 10)
    c.drawString(56, y, "Semester IV subjects")
    y -= 18
    y = rows(c, y, [
        ("Data Structures", "A"),
        ("Digital Logic", "B"),
        ("Discrete Mathematics", "A"),
        ("Environmental Studies", "B"),
    ], size=10)
    para(c, y - 8, "Provisional. The cumulative grade point average is issued with the "
                   "annual statement, not with this sheet.")
    footer(c, "TIT/COE/2025/0402")
    save(c, "marksheet-2025.pdf")


def enrolment_letter() -> None:
    c = canvas.Canvas(os.path.join(DOCS, "enrolment-letter.pdf"), pagesize=A4)
    y = page(c, "Testland Institute of Technology", "Confirmation of Enrolment")
    y = para(c, y, "The Office of Academic Affairs confirms that the student named below "
                   "is enrolled for the academic year 2026-27.")
    y -= 8
    y = rows(c, y, [
        ("Student name", "PRIYAM SHARMA"),
        ("Programme", "B.Tech Computer Engineering"),
        ("Year of study", "3"),
        ("Academic year", "2026-27"),
        ("Enrolment status", "FULL TIME"),
        ("Date of issue", "01 AUG 2026"),
    ])
    para(c, y - 8, "This letter is issued for the purpose of education loan and scholarship "
                   "applications. It is not a statement of grades.")
    footer(c, "TIT/AA/2026/1180")
    save(c, "enrolment-letter.pdf")


def statement_jul() -> None:
    c = canvas.Canvas(os.path.join(DOCS, "statement-jul-2026.pdf"), pagesize=A4)
    y = page(c, "Testland Bank", "Statement of Account")
    y = rows(c, y, [
        ("Account holder", "PRIYAM SHARMA"),
        ("Account number", "50100234567890"),
        ("Address", "44 MG Road, Pune"),
        ("Statement period", "01 JUN 2026 to 30 JUN 2026"),
        ("Date of issue", "01 JUL 2026"),
    ])
    y -= 12
    c.setFont("Helvetica-Bold", 10)
    c.drawString(56, y, "Transactions")
    y -= 20
    for label, value in [
        ("01 JUN 2026  Opening balance", "18,400.00"),
        ("04 JUN 2026  Salary credit", "32,000.00"),
        ("09 JUN 2026  Rent transfer", "-9,500.00"),
        ("17 JUN 2026  Groceries", "-2,140.00"),
        ("28 JUN 2026  Closing balance", "38,760.00"),
    ]:
        c.setFont("Courier", 10)
        c.drawString(56, y, label)
        c.drawRightString(PAGE_W - 56, y, value)
        y -= 18
    footer(c, "This statement is generated on request and does not require a signature.")
    save(c, "statement-jul-2026.pdf")


def statement_aug_2025() -> None:
    c = canvas.Canvas(os.path.join(DOCS, "statement-aug-2025.pdf"), pagesize=A4)
    y = page(c, "Testland Bank", "Statement of Account")
    y = rows(c, y, [
        ("Account holder", "PRIYAM SHARMA"),
        ("Account number", "50100234567890"),
        ("Address", "44 MG Road, Pune"),
        ("Statement period", "01 JUL 2025 to 31 JUL 2025"),
        ("Date of issue", "04 AUG 2025"),
    ])
    para(c, y - 12, "Account dormant for this period. No transactions were posted.")
    footer(c, "Archive copy.")
    save(c, "statement-aug-2025.pdf")


def utility_bill() -> None:
    c = canvas.Canvas(os.path.join(DOCS, "utility-bill-may-2026.pdf"), pagesize=A4)
    y = page(c, "Testland Power", "Electricity Bill")
    y = rows(c, y, [
        ("Customer name", "PRIYAM SHARMA"),
        ("Supply address", "7 Lake View Road, Pune 411045"),
        ("Connection number", "TP-8841-2290"),
        ("Bill date", "02 MAY 2026"),
        ("Amount due", "INR 1240"),
        ("Due date", "18 MAY 2026"),
    ])
    para(c, y - 12, "This is a notice of payment due. The supply address above is the address "
                    "at which the connection is registered.")
    footer(c, "Account in the name of the registered consumer.")
    save(c, "utility-bill-may-2026.pdf")


def lease() -> None:
    c = canvas.Canvas(os.path.join(DOCS, "lease-2024.pdf"), pagesize=A4)
    y = page(c, "Notarised copy", "Residential Tenancy Agreement")
    y = rows(c, y, [
        ("Tenant", "PRIYAM SHARMA"),
        ("Premises", "12 Nehru Road, Pune 411004"),
        ("Term", "01 JUL 2024 to 30 JUN 2025"),
        ("Monthly rent", "INR 9500"),
        ("Date of agreement", "15 JUN 2024"),
        ("Status", "VACATED 30 JUN 2025"),
    ])
    para(c, y - 12, "The tenant vacated the premises on 30 JUN 2025 and the keys were returned "
                    "to the landlord on the same date. This copy is retained for record.")
    footer(c, "Previous tenancy. Not a current address.")
    save(c, "lease-2024.pdf")


def internship_offer() -> None:
    c = canvas.Canvas(os.path.join(DOCS, "internship-offer.pdf"), pagesize=A4)
    y = page(c, "Testland Systems Private Limited", "Offer of Internship")
    y = para(c, y, "We are pleased to offer you a paid internship with our platform team.")
    y -= 8
    y = rows(c, y, [
        ("Candidate name", "PRIYAM SHARMA"),
        ("Role", "Software Engineering Intern"),
        ("Employer", "Testland Systems Private Limited"),
        ("Annual compensation", "INR 480000"),
        ("Start date", "01 SEP 2026"),
        ("Date of issue", "10 AUG 2026"),
    ])
    para(c, y - 8, "This offer is for a fixed term of eleven months and includes a monthly "
                   "stipend paid on the last working day of each month.")
    footer(c, "Signed for Testland Systems Private Limited by the Head of People.")
    save(c, "internship-offer.pdf")


def scholarship_award() -> None:
    c = canvas.Canvas(os.path.join(DOCS, "scholarship-award.pdf"), pagesize=A4)
    y = page(c, "Testland Foundation", "Merit Scholarship 2026")
    y = rows(c, y, [
        ("Awarded to", "PRIYAM SHARMA"),
        ("Institution", "Testland Institute of Technology"),
        ("Programme", "B.Tech Computer Engineering"),
        ("Amount", "INR 60000"),
        ("Date of award", "01 SEP 2026"),
    ])
    para(c, y - 12, "The award is credited directly against tuition for the academic year "
                    "2026-27 and does not need to be repaid.")
    footer(c, "Testland Foundation, registration TF-2021-0093.")
    save(c, "scholarship-award.pdf")


# --------------------------------------------------------------------------
# documents that are only a picture of a page
# --------------------------------------------------------------------------

def _render_png(lines: list[tuple[str, int, bool]], out: str) -> None:
    """Renders text into an image at 150 dpi, no text layer anywhere."""
    w, h = 1240, 1754
    img = Image.new("RGB", (w, h), "#f4f1e8")
    d = ImageDraw.Draw(img)
    serif = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"
    bold = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
    y = 120
    for text, size, is_bold in lines:
        try:
            font = ImageFont.truetype(bold if is_bold else serif, size)
        except Exception:
            font = ImageFont.load_default()
        d.text((100, y), text, font=font, fill="#1a1a1a")
        y += int(size * 1.9)
    # a slight shadow at the edge, because a photograph of a page is never even
    for i in range(60):
        d.rectangle([0, i, w, i], fill=None, outline=None)
    img.save(out)


def image_only_pdf(name: str, lines: list[tuple[str, int, bool]], kicker: str) -> None:
    png = os.path.join(HERE, f".{name}.png")
    _render_png(lines, png)
    c = canvas.Canvas(os.path.join(DOCS, name), pagesize=A4)
    c.drawImage(ImageReader(png), 0, 0, width=PAGE_W, height=PAGE_H)
    save(c, name)
    os.remove(png)


def scan_letter() -> None:
    image_only_pdf(
        "reference-letter-scan.pdf",
        [
            ("To whom it may concern", 40, True),
            ("", 20, False),
            ("I am writing in support of Priyam Sharma,", 26, False),
            ("who worked with me on the campus network", 26, False),
            ("project through the 2026 spring term.", 26, False),
            ("", 20, False),
            ("Referee: Dr A. Kulkarni", 26, True),
            ("Department of Computer Engineering", 26, False),
            ("Mobile: +91 98200 11223", 26, False),
            ("", 20, False),
            ("A. Kulkarni", 34, False),
        ],
        "Photograph of a printed letter. No text layer.",
    )


def scan_marksheet() -> None:
    image_only_pdf(
        "marksheet-photo.pdf",
        [
            ("TESTLAND INSTITUTE OF TECHNOLOGY", 34, True),
            ("Consolidated Grade Sheet", 30, True),
            ("", 18, False),
            ("Student: PRIYAM SHARMA", 26, False),
            ("Programme: B.Tech Computer Engineering", 26, False),
            ("Semester: V", 26, False),
            ("Credits earned: 24", 26, False),
            ("Date of issue: 12 JAN 2026", 26, False),
        ],
        "Photograph of a printed sheet. No text layer.",
    )


# --------------------------------------------------------------------------
# forms
# --------------------------------------------------------------------------

def text_field(c: canvas.Canvas, name: str, y: float, label: str) -> None:
    c.setFont("Helvetica", 10)
    c.setFillColor(colors.HexColor("#333333"))
    c.drawString(56, y + 5, label)
    c.acroForm.textfield(
        name=name, tooltip=label, x=250, y=y - 3, width=290, height=20,
        borderStyle="inset", borderColor=colors.HexColor("#b8b8b8"),
        fillColor=colors.HexColor("#fbfaf7"), textColor=colors.HexColor("#111111"),
        fontSize=10, forceBorder=True,
    )


def pdf_form(filename: str, kicker: str, title: str, fields: list[dict],
             note: str, footer_text: str) -> None:
    c = canvas.Canvas(os.path.join(FORMS, filename), pagesize=A4)
    y = page(c, kicker, title)
    y = para(c, y, note) - 10
    for f in fields:
        if f["type"] == "file":
            c.setFont("Helvetica", 10)
            c.setFillColor(colors.HexColor("#333333"))
            c.drawString(56, y, f["label"])
            c.acroForm.textfield(
                name=f["id"], tooltip=f["label"], x=250, y=y - 5, width=290, height=20,
                borderStyle="dashed", borderColor=colors.HexColor("#c9c9c9"),
                fillColor=colors.HexColor("#ffffff"), textColor=colors.HexColor("#111111"),
                fontSize=9, forceBorder=True,
            )
            c.setFont("Helvetica-Oblique", 7)
            c.setFillColor(colors.HexColor("#8a8a8a"))
            c.drawString(250, y + 18, "file name only")
        elif f["type"] == "textarea":
            c.setFont("Helvetica", 10)
            c.setFillColor(colors.HexColor("#333333"))
            c.drawString(56, y, f["label"])
            c.acroForm.textfield(
                name=f["id"], tooltip=f["label"], x=56, y=y - 96, width=484, height=90,
                borderStyle="inset", borderColor=colors.HexColor("#b8b8b8"),
                fillColor=colors.HexColor("#fbfaf7"), textColor=colors.HexColor("#111111"),
                fontSize=9, forceBorder=True, fieldFlags="multiline",
            )
            y -= 108
            continue
        else:
            text_field(c, f["id"], y, f["label"])
        y -= 30
    footer(c, footer_text)
    save(c, filename)


BANK_FIELDS = [
    dict(id="full_name", label="Full name", key="person.full_name", type="text", required=True),
    dict(id="dob", label="Date of birth", key="person.dob", type="date", required=True),
    dict(id="nationality", label="Nationality", key="person.nationality", type="text", required=True),
    dict(id="id_number", label="Identity document number", key="identity.id_number", type="text", required=True),
    dict(id="id_expiry", label="Identity document expiry", key="identity.id_expiry", type="date", required=True),
    dict(id="address", label="Residential address", key="address.current.line1", type="text", required=True),
    dict(id="city", label="City", key="address.current.city", type="text", required=True),
    dict(id="postcode", label="Postcode", key="address.current.postcode", type="text", required=True),
    dict(id="phone", label="Mobile number", key="person.phone.mobile", type="tel", required=True),
    dict(id="email", label="Email address", key="person.email", type="email", required=True),
    dict(id="occupation", label="Occupation", key="employment.role", type="text", required=True),
    dict(id="annual_income", label="Annual income (INR)", key="employment.income_annual", type="text", required=True),
    dict(id="attach_id", label="Attach identity document", key="documents.identity", type="file", required=True, accept="identity"),
    dict(id="attach_address", label="Attach proof of address, issued within 3 months", key="documents.address_proof", type="file", required=True, accept="address_proof"),
]

ENROLMENT_FIELDS = [
    dict(id="full_name", label="Full name", key="person.full_name", type="text", required=True),
    dict(id="dob", label="Date of birth", key="person.dob", type="date", required=True),
    dict(id="programme", label="Programme", key="education.programme", type="text", required=True),
    dict(id="institution", label="Institution", key="education.institution", type="text", required=True),
    dict(id="year", label="Year of study", key="education.year", type="text", required=True),
    dict(id="gpa", label="Cumulative grade point average", key="education.gpa", type="text", required=True),
    dict(id="address", label="Residential address", key="address.current.line1", type="text", required=True),
    dict(id="phone", label="Mobile number", key="person.phone.mobile", type="tel", required=True),
    dict(id="previous_address", label="Previous address", key="address.previous.line1", type="text", required=False),
    dict(id="referee_name", label="Referee name", key="referee.1.name", type="text", required=True),
    dict(id="attach_id", label="Attach identity document", key="documents.identity", type="file", required=True, accept="identity"),
    dict(id="attach_marksheet", label="Attach most recent statement of grades", key="documents.education", type="file", required=True, accept="education"),
]

SCHOLARSHIP_FIELDS = [
    dict(id="full_name", label="Full name", key="person.full_name", type="text", required=True),
    dict(id="dob", label="Date of birth", key="person.dob", type="date", required=True),
    dict(id="programme", label="Programme", key="education.programme", type="text", required=True),
    dict(id="institution", label="Institution", key="education.institution", type="text", required=True),
    dict(id="gpa", label="Cumulative grade point average", key="education.gpa", type="text", required=True),
    dict(id="annual_income", label="Annual household income (INR)", key="employment.income_annual", type="text", required=True),
    dict(id="address", label="Residential address", key="address.current.line1", type="text", required=True),
    dict(id="phone", label="Mobile number", key="person.phone.mobile", type="tel", required=True),
    dict(id="referee_name", label="Referee name", key="referee.1.name", type="text", required=True),
    dict(id="referee_phone", label="Referee mobile", key="referee.1.phone", type="tel", required=True),
    dict(id="attach_id", label="Attach identity document", key="documents.identity", type="file", required=True, accept="identity"),
    dict(id="attach_income", label="Attach proof of income", key="documents.income_proof", type="file", required=True, accept="income_proof"),
    dict(id="essay", label="In your own words: why are you a good fit for this scholarship?", key="essay.scholarship", type="textarea", required=True, maxWords=200),
]


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------

def main() -> int:
    os.makedirs(DOCS, exist_ok=True)
    os.makedirs(FORMS, exist_ok=True)

    print("documents:")
    passport()
    marksheet_2026()
    marksheet_2025()
    enrolment_letter()
    statement_jul()
    statement_aug_2025()
    utility_bill()
    lease()
    internship_offer()
    scholarship_award()
    scan_letter()
    scan_marksheet()

    print("forms:")
    pdf_form(
        "bank-account.pdf", "Testland Bank", "Application for a savings account",
        BANK_FIELDS,
        "Please complete every field. Proof of address must have been issued within the "
        "last three months. Attach a scanned copy where asked; the branch will verify "
        "the original in person.",
        "Form SB-1. The bank will not accept a form with blank required fields.",
    )
    pdf_form(
        "scholarship.pdf", "Testland Foundation", "Merit Scholarship application 2026",
        SCHOLARSHIP_FIELDS,
        "Awards are made on academic merit and assessed household income. The statement "
        "you write below is read by a person, not a machine.",
        "Form TF-2026. Incomplete applications are not considered.",
    )

    write_html_form()
    write_specs()

    truth = build_ground_truth()
    with open(os.path.join(ROOT, "ground-truth.json"), "w", encoding="utf-8") as fh:
        json.dump(truth, fh, indent=2, ensure_ascii=False)
    print(f"  ground-truth.json ({len(truth['documents'])} documents)")
    return 0


def write_html_form() -> None:
    rows_html = []
    for f in ENROLMENT_FIELDS:
        if f["type"] == "file":
            control = f'<input type="file" id="{f["id"]}" name="{f["id"]}" accept=".pdf,.png,.jpg">'
        elif f["type"] == "tel":
            control = f'<input type="tel" id="{f["id"]}" name="{f["id"]}" autocomplete="tel">'
        elif f["type"] == "date":
            control = f'<input type="date" id="{f["id"]}" name="{f["id"]}">'
        else:
            control = f'<input type="text" id="{f["id"]}" name="{f["id"]}">'
        req = ' <span class="req">required</span>' if f["required"] else ""
        rows_html.append(
            f'      <label class="row" for="{f["id"]}">\n'
            f'        <span class="label">{f["label"]}{req}</span>\n'
            f'        {control}\n'
            f'      </label>'
        )

    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Continuing enrolment form — Testland Institute of Technology</title>
<style>
  :root {{ --ink:#14130f; --muted:#6b675e; --line:#d9d5ca; --paper:#fbfaf6; --accent:#2f6f4f; }}
  * {{ box-sizing: border-box; }}
  body {{ margin:0; background:#efece3; color:var(--ink);
         font:16px/1.55 "Iowan Old Style", "Palatino Linotype", Georgia, serif; }}
  main {{ max-width: 720px; margin: 32px auto; background:var(--paper); padding: 40px 44px 56px;
          border:1px solid var(--line); }}
  .kicker {{ font: 600 11px/1.4 ui-monospace, "SF Mono", monospace; letter-spacing:.12em;
             text-transform:uppercase; color:var(--accent); }}
  h1 {{ font-size: 30px; line-height:1.2; margin:.35em 0 .2em; }}
  .lede {{ color:var(--muted); margin:0 0 28px; max-width:52ch; }}
  .row {{ display:grid; grid-template-columns: 240px 1fr; gap:16px; align-items:center;
          padding:12px 0; border-bottom:1px solid var(--line); }}
  .label {{ font-size:14px; }}
  .req {{ font: 10px/1 ui-monospace, monospace; color:var(--muted); text-transform:uppercase;
          letter-spacing:.08em; }}
  input {{ font: 15px/1.4 inherit; padding:8px 10px; border:1px solid var(--line);
           background:#fff; color:var(--ink); width:100%; }}
  input:focus {{ outline:2px solid var(--accent); outline-offset:1px; }}
  footer {{ margin-top:28px; font-size:13px; color:var(--muted); }}
  button {{ font: 600 14px/1 inherit; padding:12px 18px; background:var(--ink); color:#fff;
            border:0; cursor:pointer; }}
</style>
</head>
<body>
<main>
  <p class="kicker">Testland Institute of Technology · Office of Academic Affairs</p>
  <h1>Continuing enrolment form</h1>
  <p class="lede">Use this form to confirm your enrolment for the next academic year. Every
  required field must be completed. Documents must be attached as PDF or image files.</p>
  <form id="enrolment" novalidate>
{chr(10).join(rows_html)}
  </form>
  <footer>Form AA-2. This page performs no submission; it is a fixture for Lazy Susan.</footer>
</main>
</body>
</html>
"""
    path = os.path.join(FORMS, "enrolment.html")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(html)
    print("  forms/enrolment.html")


def write_specs() -> None:
    specs = [
        dict(id="bank-account", title="Application for a savings account", kind="pdf",
             file="bank-account.pdf", submissionDate="2026-10-22", kicker="Testland Bank",
             fields=BANK_FIELDS),
        dict(id="enrolment", title="Continuing enrolment form", kind="html",
             file="enrolment.html", submissionDate="2026-10-22",
             kicker="Testland Institute of Technology", fields=ENROLMENT_FIELDS),
        dict(id="scholarship", title="Merit Scholarship application 2026", kind="pdf",
             file="scholarship.pdf", submissionDate="2026-10-22", kicker="Testland Foundation",
             fields=SCHOLARSHIP_FIELDS),
    ]
    for spec in specs:
        path = os.path.join(FORMS, f"{spec['id']}.json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(spec, fh, indent=2, ensure_ascii=False)
        print(f"  forms/{spec['id']}.json ({len(spec['fields'])} fields)")


def build_ground_truth() -> dict:
    """What a perfect reader would take from each file. Used to score the reader."""
    docs = [
        dict(file="passport.pdf", kind="identity", issued="2022-02-02", readable=True, facts={
            "person.full_name": "PRIYAM SHARMA",
            "person.dob": "14 MAR 2003",
            "person.nationality": "TESTLANDI",
            "identity.id_number": "T1234567",
            "identity.id_issued": "02 FEB 2022",
            "identity.id_expiry": "01 FEB 2032",
        }),
        dict(file="marksheet-2026.pdf", kind="education", issued="2026-06-30", readable=True, facts={
            "person.full_name": "PRIYAM SHARMA",
            "education.programme": "B.Tech Computer Engineering",
            "education.year": "3",
            "education.gpa": "8.6",
            "education.institution": "Testland Institute of Technology",
        }),
        dict(file="marksheet-2025.pdf", kind="education", issued="2025-06-28", readable=True, facts={
            "person.full_name": "PRIYAM SHARMA",
            "education.programme": "B.Tech Computer Engineering",
            "education.institution": "Testland Institute of Technology",
        }),
        dict(file="enrolment-letter.pdf", kind="education", issued="2026-08-01", readable=True, facts={
            "person.full_name": "PRIYAM SHARMA",
            "education.programme": "B.Tech Computer Engineering",
            "education.year": "3",
            "education.institution": "Testland Institute of Technology",
        }),
        dict(file="statement-jul-2026.pdf", kind="address_proof", issued="2026-07-01", readable=True, facts={
            "person.full_name": "PRIYAM SHARMA",
            "address.current.line1": "44 MG Road",
            "address.current.city": "Pune",
            "finance.account_number": "50100234567890",
            "finance.bank_name": "Testland Bank",
        }),
        dict(file="statement-aug-2025.pdf", kind="address_proof", issued="2025-08-04", readable=True, facts={
            "person.full_name": "PRIYAM SHARMA",
            "address.current.line1": "44 MG Road",
            "address.current.city": "Pune",
        }),
        dict(file="utility-bill-may-2026.pdf", kind="address_proof", issued="2026-05-02", readable=True, facts={
            "person.full_name": "PRIYAM SHARMA",
            "address.current.line1": "7 Lake View Road",
            "address.current.city": "Pune",
            "address.current.postcode": "411045",
        }),
        dict(file="lease-2024.pdf", kind="other", issued="2024-06-15", readable=True, facts={
            "person.full_name": "PRIYAM SHARMA",
            "address.previous.line1": "12 Nehru Road",
        }),
        dict(file="internship-offer.pdf", kind="income_proof", issued="2026-08-10", readable=True, facts={
            "person.full_name": "PRIYAM SHARMA",
            "employment.role": "Software Engineering Intern",
            "employment.employer": "Testland Systems Private Limited",
            "employment.income_annual": "INR 480000",
        }),
        dict(file="scholarship-award.pdf", kind="other", issued="2026-09-01", readable=True, facts={
            "person.full_name": "PRIYAM SHARMA",
            "education.institution": "Testland Institute of Technology",
            "education.programme": "B.Tech Computer Engineering",
        }),
        dict(file="reference-letter-scan.pdf", kind="reference", issued="2026-04-10", readable=False, facts={
            "referee.1.name": "Dr A. Kulkarni",
            "referee.1.phone": "+91 98200 11223",
        }),
        dict(file="marksheet-photo.pdf", kind="education", issued="2026-01-12", readable=False, facts={
            "education.year": "2",
            "education.institution": "Testland Institute of Technology",
        }),
    ]
    return {
        "generatedBy": "packages/corpus/tools/make_docs.py",
        "submissionDate": "2026-10-22",
        "documents": docs,
    }


if __name__ == "__main__":
    sys.exit(main())
