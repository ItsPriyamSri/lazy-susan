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
  [/^(passport number|identity document number)$/i, KEY.identityNumber],
  [/^(date of expiry|expiry date)$/i, KEY.identityExpiry],
  [/^(programme|course)$/i, KEY.educationProgramme],
  [/^year of study$/i, KEY.educationYear],
  [/^(cumulative grade point average|cgpa|gpa)$/i, KEY.educationGpa],
  [/^institution$/i, KEY.educationInstitution],
  [/^role$/i, KEY.employmentRole],
  [/^employer$/i, KEY.employmentEmployer],
  [/^(annual compensation|annual salary|annual income)$/i, KEY.employmentIncome],
  [/^account number$/i, KEY.financeAccount],
  [/^referee$/i, KEY.refereeName],
];

const ISSUED_LABELS = /^(date of issue|bill date|date of agreement|date of award|issued on)$/i;
const ADDRESS_LABELS = /^(address|supply address|premises|residential address)$/i;

const KIND_RULES: [RegExp, DocumentKind][] = [
  [/passport/i, "identity"],
  [/statement of grades|grade sheet|grade point average/i, "education"],
  [/confirmation of enrolment/i, "education"],
  [/statement of account/i, "address_proof"],
  [/electricity bill/i, "address_proof"],
  [/offer of internship|annual compensation/i, "income_proof"],
  [/tenancy agreement/i, "other"],
  [/merit scholarship/i, "other"],
];

const FILENAME_KINDS: [RegExp, DocumentKind][] = [
  [/passport|national-id|identity/i, "identity"],
  [/marksheet|grade|transcript|certificate/i, "education"],
  [/statement|utility|bill|lease|tenancy/i, "address_proof"],
  [/offer|salary|payslip|income/i, "income_proof"],
  [/reference|referee|recommend/i, "reference"],
];

export function classify(text: string, filename: string): DocumentKind {
  for (const [re, kind] of KIND_RULES) if (re.test(text)) return kind;
  for (const [re, kind] of FILENAME_KINDS) if (re.test(filename)) return kind;
  return "other";
}

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

  const push = (key: string, value: string): void => {
    if (!value) return;
    const hit = locate(raw.pages, value);
    if (!hit) {
      unplaced.push({ key, value });
      return;
    }
    facts.push({
      key,
      value,
      source: { kind: "document", file, page: hit.page, bbox: hit.bbox, confidence: 0.98 },
    });
    labelled++;
  };

  for (const page of raw.pages) {
    for (const line of page.lines) {
      lines++;
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
      if (mapped) push(mapped[1], value);
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
  return title === head ? file.replace(/\.pdf$/i, "") : title;
}

function titleCase(s: string): string {
  const small = new Set(["of", "and", "the", "for", "at"]);
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (w && (i === 0 || !small.has(w)) ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}
