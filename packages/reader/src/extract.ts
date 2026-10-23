import { KEY, parseDate, toISO } from "@lazy-susan/core";
import type { DocumentKind, Fact } from "@lazy-susan/core";
import { locate } from "./locate.js";
import type { RawDoc } from "./pdf.js";

export interface ExtractionStats {
  /** Text lines on the page, including headings. */
  lines: number;
  /** Lines that had a recognisable label and yielded a fact. */
  labelled: number;
  /** Values a rule proposed that could not be found on the page. Should be zero. */
  unplaced: { key: string; value: string }[];
}

export interface Extraction {
  file: string;
  title: string;
  kind: DocumentKind;
  issued?: string;
  pages: number;
  confidence: number;
  digest: string;
  readable: boolean;
  facts: Fact[];
  stats: ExtractionStats;
}

/**
 * Label to key. Deliberately boring: these are the words that appear on real
 * forms, and a regular expression is better at this than a model is.
 */
const LABELS: [RegExp, string][] = [
  [/^(full name|student name|account holder|customer name|candidate name|tenant|awarded to)$/i, KEY.personName],
  [/^(date of birth|dob)$/i, KEY.personDob],
  [/^nationality$/i, KEY.personNationality],
  [/^(passport number|identity document number|aadhaar|aadhar|pan)$/i, KEY.identityNumber],
  [/^(date of expiry|expiry date)$/i, KEY.identityExpiry],
  [/^(programme|program|course|degree)$/i, KEY.educationProgramme],
  [/^(year of study|current year|year)$/i, KEY.educationYear],
  [/^(cumulative grade point average|cgpa|gpa|current cgpa)$/i, KEY.educationGpa],
  [/^(institution|college|university|school)$/i, KEY.educationInstitution],
  [/^role$/i, KEY.employmentRole],
  [/^employer$/i, KEY.employmentEmployer],
  [/^(annual compensation|annual salary|annual income)$/i, KEY.employmentIncome],
  [/^account number$/i, KEY.financeAccount],
  [/^referee$/i, KEY.refereeName],
  [/^(referee phone|referee mobile|referee contact|referee number|referee's phone)$/i, KEY.refereePhone],
  [/^(email|e-mail|email address|email id)$/i, KEY.personEmail],
  [/^(phone|mobile|mobile number|phone number|contact number|contact)$/i, KEY.personPhone],
];

const ISSUED_LABELS = /^(date of issue|bill date|date of agreement|date of award|issued on)$/i;
const ADDRESS_LABELS = /^(address|supply address|premises|residential address|current address|permanent address)$/i;

const KIND_RULES: [RegExp, DocumentKind][] = [
  [/passport/i, "identity"],
  [/statement of grades|grade sheet|grade point average/i, "education"],
  [/confirmation of enrolment/i, "education"],
  [/statement of account/i, "address_proof"],
  [/electricity bill/i, "address_proof"],
  [/offer of internship|annual compensation/i, "income_proof"],
  [/tenancy agreement/i, "other"],
  [/merit scholarship/i, "other"],
  [/curriculum vitae|^\s*resume\b|\bresume\b/i, "resume"],
];

const FILENAME_KINDS: [RegExp, DocumentKind][] = [
  [/passport|national-id|identity|aadhaar|aadhar/i, "identity"],
  [/marksheet|grade|transcript|certificate|result/i, "education"],
  [/statement|utility|bill|lease|tenancy/i, "address_proof"],
  [/offer|salary|payslip|income/i, "income_proof"],
  [/reference|referee|recommend/i, "reference"],
  [/resume|curriculum|\bcv\b/i, "resume"],
];

export function classify(text: string, filename: string): DocumentKind {
  for (const [re, kind] of KIND_RULES) if (re.test(text)) return kind;
  for (const [re, kind] of FILENAME_KINDS) if (re.test(filename)) return kind;
  return "other";
}

/** Section headings a resume uses. The lines under one belong to it. */
const HEADINGS =
  /^(skills?|technical skills|core competencies|certifications?|licenses?|certifications? (?:and|&) (?:licenses?|awards?)|awards?|achievements?|education|experience|work experience|projects?|summary|profile|about me|contact|personal details|interests?)$/i;

const EMAIL = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/;
/** A phone number, but only in a document that is a person's own history. */
const PHONE = /(?:\+\d{1,3}[\s-]?)?\d{5}[\s-]?\d{5}\b|\+\d{1,3}[\s-]?\d{4,5}[\s-]?\d{5}\b/;

export function extractDocument(file: string, raw: RawDoc, digest: string): Extraction {
  const title = titleOf(raw, file);
  const text = raw.pages.map((p) => p.text).join("\n");

  if (raw.imageOnly) {
    return {
      file,
      title,
      kind: classify(text, file),
      pages: raw.pages.length,
      confidence: 0.05,
      digest,
      readable: false,
      facts: [],
      stats: { lines: 0, labelled: 0, unplaced: [] },
    };
  }

  const kind = classify(text, file);
  const previousAddress = /\bvacated\b|previous tenancy/i.test(text);
  const facts: Fact[] = [];
  const unplaced: { key: string; value: string }[] = [];
  let issued: string | undefined;
  let labelled = 0;
  let lines = 0;

  const push = (key: string, value: string, locateAs = value): void => {
    if (!value) return;
    const hit = locate(raw.pages, locateAs);
    if (!hit) {
      unplaced.push({ key, value });
      return;
    }
    facts.push({
      key,
      value,
      source: {
        kind: "document",
        file,
        page: hit.page,
        bbox: hit.bbox,
        confidence: 0.98,
        ...(raw.format === "text" ? { line: hit.line + 1, excerpt: hit.excerpt } : {}),
      },
    });
    labelled++;
  };

  /**
   * A value assembled from several lines (a skills list) is not one string on
   * the page, so it cannot be located as a whole. It is anchored to the first
   * line of its section and carries the section as the excerpt: still a pointer,
   * just a wider one.
   */
  const pushSection = (key: string, value: string, first: string): void => {
    if (!value) return;
    const hit = locate(raw.pages, first) ?? locate(raw.pages, value.split(",")[0]!.trim());
    if (!hit) {
      unplaced.push({ key, value });
      return;
    }
    facts.push({
      key,
      value,
      source: {
        kind: "document",
        file,
        page: hit.page,
        bbox: hit.bbox,
        confidence: 0.9,
        ...(raw.format === "text" ? { line: hit.line + 1, excerpt: value } : {}),
      },
    });
    labelled++;
  };

  const sections: Record<string, string[]> = {};
  let active: "skills" | "certifications" | "other" | null = null;

  for (const page of raw.pages) {
    for (const line of page.lines) {
      lines++;
      const plain = line.text.trim();
      const headingText = plain.replace(/[:*]+$/, "");

      const heading = HEADINGS.exec(headingText);
      if (heading) {
        const name = heading[1]!.toLowerCase();
        active = /skill|competenc/i.test(name)
          ? "skills"
          : /certif|licen|award|achiev/i.test(name)
            ? "certifications"
            : "other";
        // "Skills: Python, Go" is a heading and its contents on one line.
        const inline = plain.slice(plain.indexOf(":") + 1).trim();
        if (active !== "other" && plain.includes(":") && inline) {
          (sections[active] ??= []).push(inline);
        }
        continue;
      }

      if (active && active !== "other") {
        const cleaned = plain.replace(/^[•·\-*–—]\s*/, "").trim();
        if (cleaned && !/:/.test(cleaned)) {
          (sections[active] ??= []).push(cleaned);
          continue;
        }
      }

      const cut = line.text.indexOf(":");
      if (cut < 1) continue;

      const label = line.text.slice(0, cut).trim();
      const value = line.text.slice(cut + 1).trim();
      if (!label || !value) continue;

      if (ISSUED_LABELS.test(label)) {
        const parsed = parseDate(value);
        if (parsed) issued = toISO(parsed);
        if (kind === "identity") push(KEY.identityIssued, value);
        continue;
      }

      if (ADDRESS_LABELS.test(label)) {
        const parts = value.split(",").map((p) => p.trim());
        const line1 = parts[0] ?? value;
        const rest = parts.slice(1).join(" ").trim();
        const postcode = /\b(\d{6})\b/.exec(rest)?.[1];
        const city = rest.replace(/\b\d{6}\b/, "").replace(/[,]/g, "").trim();

        if (previousAddress) {
          push(KEY.addressPrevious, line1);
        } else {
          push(KEY.addressLine1, line1);
          if (city) push(KEY.addressCity, city);
          if (postcode) push(KEY.addressPostcode, postcode);
        }
        continue;
      }

      const mapped = LABELS.find(([re]) => re.test(label));
      if (mapped) {
        // "CGPA: 8.6/10" and "CGPA: 8.6" are the same claim about the same
        // person; the scale is not part of the value.
        // "8.6/10" is the same claim as "8.6"; the scale is not part of the
        // value, but the pointer still has to be at what the page says.
        if (mapped[1] === KEY.educationGpa) {
          push(mapped[1], value.replace(/\s*\/\s*\d+(?:\.\d+)?$/, ""), value);
        } else {
          push(mapped[1], value);
        }
      }
    }
  }

  // Lists assembled from a section.
  for (const key of ["skills", "certifications"] as const) {
    const bucket = sections[key] ?? [];
    const items = bucket
      .flatMap((l) => l.split(/[,;|•·]/))
      .map((s) => s.replace(/\s+/g, " ").trim())
      .filter((s) => s.length > 1 && s.length < 60);
    const unique = [...new Set(items)];
    if (unique.length) {
      pushSection(key === "skills" ? KEY.skills : KEY.certifications, unique.join(", "), unique[0]!);
    }
  }

  // A resume does not label its own email or phone; they are just there.
  if (kind === "resume") {
    if (!facts.some((f) => f.key === KEY.personEmail)) {
      const email = EMAIL.exec(text)?.[0];
      if (email) push(KEY.personEmail, email);
    }
    if (!facts.some((f) => f.key === KEY.personPhone)) {
      const phone = PHONE.exec(text)?.[0];
      if (phone) push(KEY.personPhone, phone.replace(/\s+/g, " ").trim());
    }
    if (!facts.some((f) => f.key === KEY.personName)) {
      const first = raw.pages[0]?.lines.find((l) => /^[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3}$/.test(l.text.trim()));
      if (first && !HEADINGS.test(first.text.trim())) push(KEY.personName, first.text.trim());
    }
  }

  // The letterhead is not labelled, but it is the only place an institution or
  // a bank name appears.
  const head = raw.pages[0]?.lines[0]?.text ?? "";
  if (kind === "education" && !facts.some((f) => f.key === KEY.educationInstitution) && /institute|university|college/i.test(head)) {
    push(KEY.educationInstitution, titleCase(head));
  }
  if (kind === "address_proof" && !facts.some((f) => f.key === KEY.financeBank) && /bank/i.test(head)) {
    push(KEY.financeBank, titleCase(head));
  }

  return {
    file,
    title,
    kind,
    issued,
    pages: raw.pages.length,
    confidence: facts.length ? 0.98 : 0.4,
    digest,
    readable: true,
    facts,
    stats: { lines, labelled, unplaced },
  };
}

function titleOf(raw: RawDoc, file: string): string {
  const lines = raw.pages[0]?.lines ?? [];
  // The title is the largest-looking line under the letterhead: take the second
  // non-empty line, falling back to the file name.
  const texts = lines.map((l) => l.text.trim()).filter(Boolean);
  const head = texts[0] ?? file;
  const title = texts[1] ?? head;
  return title === head ? file.replace(/\.(pdf|docx|txt|md)$/i, "") : title;
}

function titleCase(s: string): string {
  const small = new Set(["of", "and", "the", "for", "at"]);
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (w && (i === 0 || !small.has(w)) ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}
