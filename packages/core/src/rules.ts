import { ago, isBefore, monthsBetween, parseDate, today } from "./dates.js";
import { DATE_KEYS, INCOME_KEYS, KEY, KEY_LABEL, KIND_KEYS, RECENCY_KEYS } from "./keys.js";
import { Index, normalise } from "./store.js";
import type {
  Candidate,
  Counts,
  DocumentRecord,
  Fact,
  FieldResult,
  FieldSpec,
  FormSpec,
  RuleSet,
  RunResult,
  Source,
  Verdict,
} from "./types.js";

/** How the app says "nothing here" for a given fact, in plain words. */
const ABSENCE: Record<string, string> = {
  [KEY.personPhone]: "No document in your folder contains a phone number.",
  [KEY.personEmail]: "No document in your folder contains an email address.",
  [KEY.personName]: "No document in your folder states your full name.",
  [KEY.personDob]: "No document in your folder states a date of birth.",
  [KEY.identityNumber]: "No identity document in your folder was readable.",
  [KEY.educationGpa]: "No marksheet in your folder was readable.",
  [KEY.educationProgramme]: "No enrolment document in your folder names a programme.",
  [KEY.educationYear]: "No document in your folder states a year of study.",
  [KEY.educationInstitution]: "No document in your folder names an institution.",
  [KEY.employmentIncome]: "No income document in your folder was readable.",
  [KEY.employmentEmployer]: "No document in your folder names an employer.",
  [KEY.employmentRole]: "No document in your folder names a role.",
  [KEY.refereeName]: "No document in your folder names a referee.",
  [KEY.refereePhone]: "No document in your folder contains a referee's number.",
  [KEY.skills]: "No document in your folder lists skills.",
  [KEY.summary]: "No document in your folder contains a summary.",
  [KEY.certifications]: "No document in your folder lists a certification.",
  [KEY.financeBank]: "No statement in your folder names a bank.",
  [KEY.financeAccount]: "No statement in your folder shows an account number.",
};

const NOUN: Record<string, string> = {
  "identity": "identity document",
  "address_proof": "proof of address",
  "income_proof": "proof of income",
  "education": "education document",
  "reference": "reference letter",
  "resume": "resume",
  "other": "document",
};

export const DEFAULT_RULES: RuleSet = {
  addressProofMaxAgeMonths: 3,
  identityMustBeValidOn: "2026-10-22",
  minConfidence: 0.6,
  requireIncomeProof: true,
};

export function resolveField(
  field: FieldSpec,
  index: Index,
  rules: RuleSet,
  form: FormSpec,
): FieldResult {
  return field.type === "file"
    ? resolveAttachment(field, index, rules, form)
    : resolveValue(field, index, rules, form);
}

function resolveAttachment(
  field: FieldSpec,
  index: Index,
  rules: RuleSet,
  form: FormSpec,
): FieldResult {
  const kind = field.accept ?? "other";
  const noun = NOUN[kind] ?? "document";
  const docs = index.docsOfKind(kind);

  if (docs.length === 0) {
    return {
      field,
      verdict: "ASKED",
      reason: `No ${noun} in your folder.`,
    };
  }

  const readable = docs.filter((d) => d.confidence >= rules.minConfidence);
  if (readable.length === 0) {
    return {
      field,
      verdict: "UNREADABLE",
      reason: `The ${noun} in your folder could not be read with enough confidence: ${docs.map((d) => d.file).join(", ")}.`,
    };
  }

  const asOf = parseDate(form.submissionDate) ?? today();
  const scored = readable.map((d) => ({ doc: d, problem: attachmentProblem(d, kind, index, rules, asOf) }));
  const clean = scored.filter((s) => !s.problem);

  if (clean.length === 0) {
    const worst = scored[0]!;
    return {
      field,
      verdict: "EXPIRED",
      reason: worst.problem!,
      candidates: scored.map((s) => ({ value: s.doc.file, file: s.doc.file, issued: s.doc.issued })),
    };
  }

  const best = clean
    .sort(
      (a, b) =>
        relevance(field.label, b.doc) - relevance(field.label, a.doc) ||
        (b.doc.issued ?? "").localeCompare(a.doc.issued ?? ""),
    )[0]!.doc;
  return {
    field,
    verdict: "FILLED",
    value: best.file,
    reason: `Attached ${best.file}${best.issued ? `, issued ${best.issued}` : ""}.`,
    source: { kind: "document", file: best.file, page: 1, bbox: { x: 0, y: 0, w: 1, h: 1 }, confidence: best.confidence },
  };
}

function attachmentProblem(
  doc: DocumentRecord,
  kind: string,
  index: Index,
  rules: RuleSet,
  asOf: { y: number; m: number; d: number },
): string | null {
  if (kind === "address_proof") {
    if (!doc.issued) return `The ${doc.file} has no date on it, so it cannot prove the address is current.`;
    const issued = parseDate(doc.issued);
    if (!issued) return `The date on ${doc.file} could not be read.`;
    const age = monthsBetween(issued, asOf);
    if (age > rules.addressProofMaxAgeMonths) {
      return `The ${doc.file} is ${ago(issued, asOf)}; this form accepts proof issued within ${rules.addressProofMaxAgeMonths} months.`;
    }
    return null;
  }

  if (kind === "identity") {
    // Prefer the expiry recorded against this exact file.
    const expiryFact = index
      .byKey(KEY.identityExpiry)
      .find((f) => f.source.kind === "document" && f.source.file === doc.file);
    const expiry = parseDate(expiryFact?.value) ?? (doc.issued ? null : null);
    if (expiry && isBefore(expiry, asOf)) {
      return `The ${doc.file} expired on ${expiryFact?.value ?? "a date the app could read"}.`;
    }
    return null;
  }

  return null;
}

function resolveValue(
  field: FieldSpec,
  index: Index,
  rules: RuleSet,
  form: FormSpec,
): FieldResult {
  const key = field.key;
  const attested = index.attestedFor(key);
  const resolved =
    attested && attested.source.kind === "attested" && attested.source.resolvedAgainst
      ? attested
      : undefined;
  if (resolved) {
    return {
      field,
      verdict: "FILLED",
      value: resolved.value,
      weak: true,
      reason: `You chose this over ${resolved.source.kind === "attested" ? resolved.source.resolvedAgainst : ""}.`,
      source: resolved.source,
    };
  }

  const all = index.documentFacts(key);
  const good = all.filter((f) => f.source.kind === "document" && f.source.confidence >= rules.minConfidence);

  // A document too old for this form is not evidence any more, so it must not
  // start a disagreement. Otherwise a utility bill from last spring argues with
  // this month's statement about an address it cannot prove.
  const asOf = parseDate(form.submissionDate) ?? today();
  const freshEnough = (f: Fact): boolean => {
    if (!RECENCY_KEYS.includes(key)) return true;
    const doc = docFor(index, f.source);
    const issued = doc?.issued ? parseDate(doc.issued) : null;
    return !issued || monthsBetween(issued, asOf) <= rules.addressProofMaxAgeMonths;
  };
  const fresh = good.filter(freshEnough);
  const distinct = distinctOf(ranked(index, key, fresh));

  if (distinct.length > 1) {
    const candidates: Candidate[] = distinct.map((d) => ({
      value: d.value,
      file: d.source.kind === "document" ? d.source.file : "",
      issued: docFor(index, d.source)?.issued,
    }));
    return {
      field,
      verdict: "CONFLICT",
      reason: `Two documents disagree: ${candidates.map((c) => `${c.value} (${c.file}${c.issued ? `, ${c.issued.slice(0, 7)}` : ""})`).join(" and ")}.`,
      candidates,
    };
  }

  if (distinct.length === 1) {
    const fact = distinct[0]!;
    const src = fact.source;
    if (src.kind !== "document") {
      return { field, verdict: "ASKED", reason: ABSENCE[key] ?? `Nothing in the folder supports "${field.label}".` };
    }

    const doc = docFor(index, src);
    const asOf = parseDate(form.submissionDate) ?? today();

    if (RECENCY_KEYS.includes(key) && doc?.issued) {
      const issued = parseDate(doc.issued);
      if (issued && monthsBetween(issued, asOf) > rules.addressProofMaxAgeMonths) {
        return {
          field,
          verdict: "EXPIRED",
          value: fact.value,
          reason: `The only proof of this is ${src.file}, issued ${ago(issued, asOf)}. This form accepts ${rules.addressProofMaxAgeMonths} months.`,
          candidates: [{ value: fact.value, file: src.file, issued: doc.issued }],
        };
      }
    }

    const dateKind = DATE_KEYS[key];
    if (dateKind) {
      const parsed = parseDate(fact.value);
      if (!parsed) {
        return {
          field,
          verdict: "UNREADABLE",
          reason: `"${fact.value}" on ${src.file} is not a date this app can read.`,
        };
      }
      if (dateKind === "expires" && isBefore(parsed, asOf)) {
        return {
          field,
          verdict: "EXPIRED",
          reason: `${KEY_LABEL[key] ?? field.label} is ${fact.value}, which is before the submission date.`,
        };
      }
      return {
        field,
        verdict: "FILLED",
        value: fact.value,
        reason: `From ${src.file}.`,
        source: src,
      };
    }

    if (rules.requireIncomeProof && INCOME_KEYS.includes(key) && doc && doc.kind !== "income_proof") {
      return {
        field,
        verdict: "ASKED",
        reason: `The only number in that slot comes from ${src.file}, which proves ${doc.kind === "education" ? "grades" : "something else"}, not income.`,
      };
    }

    return {
      field,
      verdict: "FILLED",
      value: fact.value,
      reason: `From ${src.file}${src.page > 1 ? `, page ${src.page}` : ""}.`,
      source: src,
    };
  }

  // Everything that could prove this is too old to count.
  if (good.length > 0 && fresh.length === 0) {
    const newest = ranked(index, key, good)[0]!;
    const doc = docFor(index, newest.source);
    const issued = doc?.issued ? parseDate(doc.issued) : null;
    return {
      field,
      verdict: "EXPIRED",
      value: newest.value,
      reason: `The only proof of this is ${doc?.file ?? "a document"}, issued ${issued ? ago(issued, asOf) : "a while ago"}. This form accepts ${rules.addressProofMaxAgeMonths} months.`,
      candidates: [{ value: newest.value, file: doc?.file ?? "", issued: doc?.issued }],
    };
  }

  // Somebody typed it. That beats a file the app cannot read, but it never
  // beats a file it can.
  if (attested) {
    return {
      field,
      verdict: "FILLED",
      value: attested.value,
      weak: true,
      reason: "You answered this. There is no document behind it.",
      source: attested.source,
    };
  }

  if (all.length > 0) {
    return {
      field,
      verdict: "UNREADABLE",
      reason: `${all.map((f) => (f.source.kind === "document" ? f.source.file : "a scan")).join(", ")} could not be read with enough confidence.`,
    };
  }

  // Nothing was read. Before asking, check whether a file that could have
  // carried this value simply could not be read at all.
  const blind = index.documents.find(
    (d) => d.confidence < rules.minConfidence && (KIND_KEYS[d.kind] ?? []).includes(key),
  );
  if (blind) {
    return {
      field,
      verdict: "UNREADABLE",
      reason: `${blind.file} is in your folder and would normally show this, but it is a picture with no text layer, so I cannot read it.`,
    };
  }

  return {
    field,
    verdict: "ASKED",
    reason: ABSENCE[key] ?? `Nothing in the folder supports "${field.label}".`,
  };
}

function distinctOf(facts: Fact[]): Fact[] {
  const seen = new Set<string>();
  const out: Fact[] = [];
  for (const f of facts) {
    const n = normalise(f.value);
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(f);
  }
  return out;
}

/**
 * Where a value came from matters as much as when.
 *
 * A passport is a better source for a name than an award letter is, even if the
 * award letter is newer. A bank statement is a better source for an address
 * than a tenancy agreement is. When two documents agree, the better one is the
 * one the interface points at.
 */
function authority(kind: string, key: string): number {
  const ns = key.split(".")[0];
  if (ns === "person" || ns === "identity") return kind === "identity" ? 3 : kind === "education" ? 2 : 1;
  if (ns === "education") return kind === "education" ? 3 : 1;
  if (ns === "employment") return kind === "income_proof" ? 3 : 1;
  if (ns === "address") return kind === "address_proof" ? 3 : 1;
  if (ns === "referee") return kind === "reference" ? 3 : 1;
  if (ns === "finance") return kind === "address_proof" ? 2 : 1;
  return 1;
}

function ranked(index: Index, key: string, facts: Fact[]): Fact[] {
  const score = (f: Fact): number => {
    const doc = docFor(index, f.source);
    return authority(doc?.kind ?? "other", key);
  };
  return [...facts].sort(
    (a, b) => score(b) - score(a) || issuedOf(index, b.source).localeCompare(issuedOf(index, a.source)),
  );
}

function docFor(index: Index, source: Source): DocumentRecord | undefined {
  if (source.kind !== "document") return undefined;
  return index.documents.find((d) => d.file === source.file);
}

/** How much of the field's own wording appears in the document's title. */
function relevance(label: string, doc: DocumentRecord): number {
  const words = label.toLowerCase().split(/\W+/).filter((w) => w.length >= 4);
  const title = (doc.title ?? doc.file).toLowerCase();
  return words.filter((w) => title.includes(w)).length;
}

function issuedOf(index: Index, source: Source): string {
  return docFor(index, source)?.issued ?? "";
}

export function runForm(form: FormSpec, index: Index, rules: RuleSet, at: string): RunResult {
  // A paragraph question is not a fact lookup, so it is not resolved against
  // the index. It is still a field: the interface has to show the question and
  // say who answers it, and `annotateEssay` decides whether a draft can be
  // traced. Leaving it out made the essay invisible on the form it belongs to.
  const fields = form.fields.map((f) => {
    if (f.type !== "textarea") return resolveField(f, index, rules, form);

    // A paragraph is not looked up in the folder, but once you have written
    // one it is on record like any other answer.
    const attested = index.attestedFor(f.key);
    return attested
      ? {
          field: f,
          verdict: "FILLED" as const,
          value: attested.value,
          source: attested.source,
          reason: "Your own words, on the record.",
          weak: true,
        }
      : {
          field: f,
          verdict: "ASKED" as const,
          reason: "A paragraph question. It is drafted and checked on its own, not looked up in the folder.",
        };
  });
  const counts: Counts = { FILLED: 0, ASKED: 0, CONFLICT: 0, EXPIRED: 0, UNREADABLE: 0 };
  for (const f of fields) counts[f.verdict as Verdict]++;
  return {
    formId: form.id,
    formTitle: form.title,
    at,
    rules,
    fields,
    counts,
    askList: fields.filter((f) => f.verdict !== "FILLED"),
    indexHash: index.hash(),
  };
}
