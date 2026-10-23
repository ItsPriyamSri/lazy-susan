#!/usr/bin/env python3
"""Writes the two non-PDF documents in the corpus.

A .docx is a zip with a few XML files; this builds the smallest valid one
instead of pulling in a library. A .txt is a .txt.

The content is invented, like the rest of the corpus. It exists so the reader
has a resume to pull skills, certifications and a CGPA out of, and a plain-text
note that names a referee.
"""

import zipfile
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / "docs"

RESUME = [
    "PRIYAM SHARMA",
    "Email: priyam.sharma@example.edu",
    "Phone: +91 98200 11223",
    "Address: 44 MG Road, Pune 411001",
    "",
    "SUMMARY",
    "Final-year Computer Engineering student who likes boring software and",
    "forms that fill themselves.",
    "",
    "SKILLS",
    "Python, TypeScript, SQL, React, Docker, Git",
    "",
    "CERTIFICATIONS",
    "AWS Certified Cloud Practitioner",
    "Google Data Analytics Certificate",
    "",
    "EDUCATION",
    "Institution: Testland Institute of Technology",
    "Programme: B.Tech Computer Engineering",
    "Year: 4",
    "CGPA: 8.6",
]

NOTES = """Referee: Dr A. Menon
Referee phone: +91 90000 00000
Referee email: a.menon@example.edu

These notes exist so the folder has a plain-text file, not just PDFs.
Nothing here is real.
"""

CONTENT_TYPES = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""

RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"""


def document_xml(lines):
    body = []
    for line in lines:
        run = ""
        if line:
            run = '<w:r><w:t xml:space="preserve">%s</w:t></w:r>' % (
                line.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            )
        body.append('<w:p>%s</w:p>' % run)
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        "<w:body>%s</w:body></w:document>" % "".join(body)
    )


def main():
    DOCS.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(DOCS / "resume.docx", "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", RELS)
        z.writestr("word/document.xml", document_xml(RESUME))

    (DOCS / "notes.txt").write_text(NOTES, encoding="utf-8")
    print("wrote resume.docx and notes.txt")


if __name__ == "__main__":
    main()
