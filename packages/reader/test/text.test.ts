import { copyFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { layoutText, locate, readDocx, readOne } from "../src/index.js";

/**
 * A .docx is a zip with one XML file that matters. These fixtures build the
 * smallest one that is still a real .docx, so the test reads what a person
 * would upload rather than a hand-made object.
 */
const DOCUMENT_XML = (lines: string[]): string =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
${lines.map((line) => `<w:p><w:r><w:t xml:space="preserve">${line}</w:t></w:r></w:p>`).join("")}
</w:body></w:document>`;

function docx(lines: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "ls-docx-"));
  const path = join(dir, "resume.docx");
  const zip = zipSync({
    "[Content_Types].xml": new TextEncoder().encode(
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`,
    ),
    "word/document.xml": new TextEncoder().encode(DOCUMENT_XML(lines)),
  });
  writeFileSync(path, zip);
  return path;
}

const RESUME = [
  "PRIYAM SHARMA",
  "Email: priyam.sharma@example.edu",
  "Phone: +91 98200 11223",
  "Address: 44 MG Road, Pune 411001",
  "",
  "SKILLS",
  "Python, TypeScript, SQL, React",
  "",
  "CERTIFICATIONS",
  "AWS Certified Cloud Practitioner",
  "Google Data Analytics Certificate",
  "",
  "EDUCATION",
  "Institution: Testland Institute of Technology",
  "Programme: B.Tech Computer Engineering",
  "CGPA: 8.6/10",
];

describe("a .docx resume", () => {
  const dir = mkdtempSync(join(tmpdir(), "ls-docs-"));
  const path = docx(RESUME);
  const name = path.split("/").pop()!;
  copyFileSync(path, join(dir, name));
  const read = readOne(dir, name);

  it("is read as a resume, not as an unknown file", () => {
    expect(read.readable).toBe(true);
    expect(read.kind).toBe("resume");
    expect(read.stats.unplaced).toEqual([]);
  });

  it("pulls skills, certifications and a CGPA out of it", () => {
    const byKey = Object.fromEntries(read.facts.map((f) => [f.key, f.value]));
    expect(byKey["skills.list"]).toContain("Python");
    expect(byKey["skills.list"]).toContain("React");
    expect(byKey["certifications.list"]).toBe(
      "AWS Certified Cloud Practitioner, Google Data Analytics Certificate",
    );
    expect(byKey["education.gpa"]).toBe("8.6");
    expect(byKey["person.email"]).toBe("priyam.sharma@example.edu");
    expect(byKey["person.phone.mobile"]).toBe("+91 98200 11223");
  });

  it("keeps the line every value was read from", () => {
    const email = read.facts.find((f) => f.key === "person.email")!;
    expect(email.source.kind).toBe("document");
    if (email.source.kind !== "document") return;
    expect(email.source.line).toBe(2);
    expect(email.source.excerpt).toBe("Email: priyam.sharma@example.edu");
  });
});

describe("a .txt file", () => {
  it("finds a referee on the line it is written on", () => {
    const dir = mkdtempSync(join(tmpdir(), "ls-txt-"));
    writeFileSync(join(dir, "notes.txt"), "Referee: Dr A. Menon\nReferee phone: +91 90000 00000\n");
    const read = readOne(dir, "notes.txt");

    expect(read.readable).toBe(true);
    const name = read.facts.find((f) => f.key === "referee.1.name")!;
    const phone = read.facts.find((f) => f.key === "referee.1.phone")!;
    expect(name.value).toBe("Dr A. Menon");
    expect(phone.value).toBe("+91 90000 00000");
    expect(name.source.kind === "document" && name.source.line).toBe(1);
    expect(phone.source.kind === "document" && phone.source.line).toBe(2);
  });
});

describe("layoutText", () => {
  it("gives every line a position, so locate works on files without pages", () => {
    const raw = readDocx(docx(RESUME));
    expect(raw.format).toBe("text");
    const found = locate(raw.pages, "Google Data Analytics Certificate");
    expect(found).not.toBeNull();
    expect(found!.line).toBeGreaterThan(0);
    expect(found!.excerpt).toBe("Google Data Analytics Certificate");
  });

  it("does not invent words that are not in the file", () => {
    const raw = layoutText("x.txt", ["hello world"]);
    expect(locate(raw.pages, "goodbye world")).toBeNull();
  });
});
