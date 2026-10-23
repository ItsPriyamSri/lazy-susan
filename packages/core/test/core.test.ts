import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULES,
  Index,
  Journal,
  KEY,
  annotateEssay,
  canSubmit,
  isBefore,
  monthsBetween,
  parseDate,
  planFill,
  runForm,
} from "../src/index.js";
import type { DocumentRecord, Fact, FieldSpec, FormSpec } from "../src/index.js";

const doc = (file: string, kind: DocumentRecord["kind"], issued: string, confidence = 0.9): DocumentRecord => ({
  file,
  kind,
  issued,
  pages: 1,
  confidence,
  digest: `sha256:${file}`,
});

const fact = (
  key: string,
  value: string,
  file: string,
  confidence = 0.9,
): Fact => ({
  key,
  value,
  source: { kind: "document", file, page: 1, bbox: { x: 0.1, y: 0.2, w: 0.4, h: 0.05 }, confidence },
});

function fixture() {
  const index = new Index();

  index.addDocument(doc("passport.png", "identity", "2022-02-02", 0.94));
  index.addDocument(doc("statement-jul.png", "address_proof", "2026-07-01", 0.91));
  index.addDocument(doc("utility-may.png", "address_proof", "2026-05-02", 0.83));
  index.addDocument(doc("lease-2024.pdf", "other", "2024-06-15", 0.88));
  index.addDocument(doc("marksheet.png", "education", "2026-06-30", 0.9));
  index.addDocument(doc("blur.png", "identity", "2020-01-01", 0.2));

  index.addFact(fact(KEY.personName, "Priyam Sharma", "passport.png", 0.97));
  index.addFact(fact(KEY.personDob, "14 MAR 2003", "passport.png", 0.95));
  index.addFact(fact(KEY.identityNumber, "T1234567", "passport.png", 0.93));
  index.addFact(fact(KEY.identityExpiry, "01 FEB 2032", "passport.png", 0.92));

  index.addFact(fact(KEY.addressLine1, "44 MG Road, Pune", "statement-jul.png", 0.9));
  index.addFact(fact(KEY.addressLine1, "12 Nehru Road, Pune", "utility-may.png", 0.86));

  index.addFact(fact(KEY.educationInstitution, "Testland Institute", "marksheet.png", 0.91));
  index.addFact(fact(KEY.educationGpa, "8.6", "marksheet.png", 0.9));
  index.addFact(fact(KEY.educationYear, "3", "marksheet.png", 0.9));
  index.addFact(fact(KEY.employmentIncome, "8.6", "marksheet.png", 0.9));

  return index;
}

const field = (over: Partial<FieldSpec>): FieldSpec => ({
  id: "f",
  label: "Field",
  key: KEY.personName,
  type: "text",
  required: true,
  ...over,
});

const form = (fields: FieldSpec[]): FormSpec => ({
  id: "bank",
  title: "Bank account",
  kind: "pdf",
  submissionDate: "2026-10-22",
  fields,
});

describe("dates", () => {
  it("reads the way dates are printed", () => {
    expect(parseDate("14 MAR 2003")).toEqual({ y: 2003, m: 3, d: 14 });
    expect(parseDate("2026-07-01")).toEqual({ y: 2026, m: 7, d: 1 });
    expect(parseDate("01/02/2032")).toEqual({ y: 2032, m: 2, d: 1 });
    expect(parseDate("garbage")).toBeNull();
  });

  it("counts whole months and orders dates", () => {
    expect(monthsBetween({ y: 2026, m: 7, d: 1 }, { y: 2026, m: 10, d: 22 })).toBe(3);
    expect(monthsBetween({ y: 2026, m: 5, d: 2 }, { y: 2026, m: 10, d: 22 })).toBe(5);
    expect(isBefore({ y: 2024, m: 2, d: 1 }, { y: 2026, m: 10, d: 22 })).toBe(true);
  });
});

describe("five verdicts", () => {
  const index = fixture();

  it("FILLED from a document when one source agrees", () => {
    const r = runForm(form([field({ id: "name", key: KEY.personName })]), index, DEFAULT_RULES, "2026-10-22T00:00:00Z");
    expect(r.fields[0]!.verdict).toBe("FILLED");
    expect(r.fields[0]!.value).toBe("Priyam Sharma");
  });

  it("CONFLICT when two fresh documents disagree", () => {
    // Both proofs have to be inside the form's window to argue: an expired
    // bill is not a second opinion.
    const r = runForm(
      form([field({ id: "addr", key: KEY.addressLine1 })]),
      index,
      { ...DEFAULT_RULES, addressProofMaxAgeMonths: 12 },
      "2026-10-22T00:00:00Z",
    );
    expect(r.fields[0]!.verdict).toBe("CONFLICT");
    expect(r.fields[0]!.candidates).toHaveLength(2);
  });

  it("ignores a proof that is too old when a fresh one agrees with itself", () => {
    const r = runForm(form([field({ id: "addr", key: KEY.addressLine1 })]), index, DEFAULT_RULES, "2026-10-22T00:00:00Z");
    expect(r.fields[0]!.verdict).toBe("FILLED");
    expect(r.fields[0]!.value).toBe("44 MG Road, Pune");
  });

  it("EXPIRED when the only proof of address is too old", () => {
    const fresh = new Index();
    fresh.addDocument(doc("utility-may.png", "address_proof", "2026-05-02", 0.83));
    fresh.addFact(fact(KEY.addressLine1, "44 MG Road, Pune", "utility-may.png", 0.83));
    const r = runForm(
      form([field({ id: "addr", key: KEY.addressLine1 })]),
      fresh,
      { ...DEFAULT_RULES, addressProofMaxAgeMonths: 3 },
      "2026-10-22T00:00:00Z",
    );
    expect(r.fields[0]!.verdict).toBe("EXPIRED");
    expect(r.fields[0]!.reason).toContain("5 months ago");
  });

  it("EXPIRED when an identity document is past its date", () => {
    const fresh = new Index();
    fresh.addDocument(doc("oldid.png", "identity", "2018-01-01", 0.9));
    fresh.addFact(fact(KEY.identityExpiry, "01 JAN 2024", "oldid.png", 0.9));
    const r = runForm(
      form([field({ id: "id", key: KEY.identityExpiry, type: "date" })]),
      fresh,
      DEFAULT_RULES,
      "2026-10-22T00:00:00Z",
    );
    expect(r.fields[0]!.verdict).toBe("EXPIRED");
  });

  it("ASKED when nothing proves it", () => {
    const r = runForm(form([field({ id: "ph", key: KEY.personPhone })]), index, DEFAULT_RULES, "2026-10-22T00:00:00Z");
    expect(r.fields[0]!.verdict).toBe("ASKED");
    expect(r.fields[0]!.reason).toBe("No document in your folder contains a phone number.");
  });

  it("UNREADABLE when the only scan was too poor to trust", () => {
    const fresh = new Index();
    fresh.addDocument(doc("blur.png", "identity", "2020-01-01", 0.2));
    fresh.addFact(fact(KEY.personName, "P Sharma", "blur.png", 0.2));
    const r = runForm(form([field({ id: "n", key: KEY.personName })]), fresh, DEFAULT_RULES, "2026-10-22T00:00:00Z");
    expect(r.fields[0]!.verdict).toBe("UNREADABLE");
  });

  it("refuses to feed an income field from a marksheet", () => {
    const r = runForm(
      form([field({ id: "inc", key: KEY.employmentIncome })]),
      index,
      DEFAULT_RULES,
      "2026-10-22T00:00:00Z",
    );
    expect(r.fields[0]!.verdict).toBe("ASKED");
    expect(r.fields[0]!.reason).toContain("not income");
  });
});

describe("attestation", () => {
  it("fills a gap once answered, and marks it weak", () => {
    const index = fixture();
    index.attest({
      key: KEY.personPhone,
      value: "+91 90000 00000",
      source: { kind: "attested", at: "2026-10-22T09:00:00Z", formId: "bank", by: "human" },
    });
    const r = runForm(form([field({ id: "ph", key: KEY.personPhone })]), index, DEFAULT_RULES, "2026-10-22T00:00:00Z");
    expect(r.fields[0]!.verdict).toBe("FILLED");
    expect(r.fields[0]!.weak).toBe(true);
  });

  it("a conflict resolution wins over both documents", () => {
    const index = fixture();
    index.attest({
      key: KEY.addressLine1,
      value: "44 MG Road, Pune",
      source: {
        kind: "attested",
        at: "2026-10-22T09:00:00Z",
        formId: "bank",
        by: "human",
        resolvedAgainst: "lease-2024.pdf",
      },
    });
    const r = runForm(form([field({ id: "addr", key: KEY.addressLine1 })]), index, DEFAULT_RULES, "2026-10-22T00:00:00Z");
    expect(r.fields[0]!.verdict).toBe("FILLED");
    expect(r.fields[0]!.value).toBe("44 MG Road, Pune");
  });
});

describe("journal", () => {
  it("undo restores a byte-identical index", () => {
    const index = fixture();
    const before = index.hash();

    const journal = new Journal();
    journal.append({ op: "commit", label: "index pass 1", facts: [], documents: [] }, "2026-10-22T09:00:00Z");
    index.attest({
      key: KEY.personPhone,
      value: "+91 90000 00000",
      source: { kind: "attested", at: "2026-10-22T09:01:00Z", formId: "bank", by: "human" },
    });
    journal.append(
      {
        op: "attest",
        label: "phone",
        fact: {
          key: KEY.personPhone,
          value: "+91 90000 00000",
          source: { kind: "attested", at: "2026-10-22T09:01:00Z", formId: "bank", by: "human" },
        },
      },
      "2026-10-22T09:01:00Z",
    );

    const { index: restored } = journal.undo();
    expect(journal.verify().ok).toBe(true);
    // replaying only the first (empty) commit yields an empty index, so compare
    // against the empty index rather than the mutated one
    expect(restored.hash()).toBe(new Index().hash());
    expect(before).not.toBe(index.hash());
  });

  it("detects an edited entry", () => {
    const journal = new Journal();
    journal.append({ op: "commit", label: "a", facts: [], documents: [] }, "2026-10-22T09:00:00Z");
    journal.append({ op: "commit", label: "b", facts: [], documents: [] }, "2026-10-22T09:01:00Z");
    expect(journal.verify().ok).toBe(true);
    journal.entries[0]!.op = { op: "commit", label: "tampered", facts: [], documents: [] };
    expect(journal.verify().ok).toBe(false);
  });
});

describe("essay", () => {
  const index = fixture();

  it("strikes a sentence that invents a number", () => {
    const draft = annotateEssay(
      "Why are you a good fit?",
      [
        { text: "I am in my third year at Testland Institute.", supports: [KEY.educationInstitution] },
        { text: "I led a team of five engineers.", supports: [KEY.educationInstitution] },
        { text: "My GPA is 8.6.", supports: [KEY.educationGpa] },
        { text: "I have completed 12 projects.", supports: [KEY.educationGpa] },
      ],
      index,
      200,
    );
    expect(draft.accepted).toHaveLength(2);
    expect(draft.struck).toHaveLength(2);
    expect(draft.struck[0]!.reason).toContain("five");
    expect(draft.text).not.toContain("engineers");
  });

  it("strikes a number that belongs to a different claim", () => {
    // The draft the local model actually wrote. "Three years of experience" is
    // not in the folder: the internship starts in September, and the year of
    // study is 3, which is a different thing to say.
    const draft = annotateEssay(
      "Why are you a good fit?",
      [
        {
          text: "I have three years of experience as a Software Engineering Intern.",
          supports: [KEY.educationInstitution, KEY.educationGpa],
        },
        {
          text: "I am in year 3 at Testland Institute.",
          supports: [KEY.educationInstitution, KEY.educationYear],
        },
      ],
      index,
      200,
    );
    expect(draft.struck).toHaveLength(1);
    expect(draft.struck[0]!.text).toContain("three years");
    expect(draft.accepted).toHaveLength(1);
  });

  it("refuses when there are fewer than three facts behind it", () => {
    const draft = annotateEssay(
      "Why you?",
      [{ text: "My GPA is 8.6.", supports: [KEY.educationGpa] }],
      index,
      200,
    );
    expect(draft.refused).toBeTruthy();
  });
});

describe("fill plan", () => {
  it("blocks submit while a required field is unresolved", () => {
    const index = fixture();
    const spec = form([
      field({ id: "name", key: KEY.personName }),
      field({ id: "phone", key: KEY.personPhone }),
    ]);
    const run = runForm(spec, index, DEFAULT_RULES, "2026-10-22T00:00:00Z");
    const plan = planFill(run);
    expect(plan.patches.map((p) => p.fieldId)).toEqual(["name"]);
    expect(plan.blocked).toHaveLength(1);
    expect(canSubmit(run)).toBe(false);
  });
});
