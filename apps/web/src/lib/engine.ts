import { DEFAULT_RULES, Index, Journal } from "@lazy-susan/core";
import type { Fact, RuleSet } from "@lazy-susan/core";
import type { ReplayData } from "./types";

export interface Answer {
  key: string;
  value: string;
  formId: string;
  against?: string;
  at: string;
}

/**
 * Rebuilds the index from the frozen facts plus anything the person has since
 * answered. Same code path as the server, so the hash in the corner is the same
 * hash the laptop printed.
 */
export function buildIndex(data: ReplayData, answers: Answer[]): Index {
  const index = new Index();
  for (const doc of data.index.documents) index.addDocument(doc);
  for (const fact of data.index.facts) index.addFact(fact);

  for (const a of answers) {
    const fact: Fact = {
      key: a.key,
      value: a.value,
      source: {
        kind: "attested",
        at: a.at,
        formId: a.formId,
        by: "human",
        ...(a.against ? { resolvedAgainst: a.against } : {}),
      },
    };
    index.attest(fact);
  }
  return index;
}

/** A journal over the frozen facts, so undo can be proved rather than asserted. */
export function journalFor(data: ReplayData, answers: Answer[]): Journal {
  const journal = new Journal();
  const at = data.readAt;
  for (const doc of data.index.documents) {
    journal.append(
      {
        op: "commit",
        label: `read ${doc.file}`,
        facts: data.index.facts.filter((f) => f.source.kind === "document" && f.source.file === doc.file),
        documents: [doc],
      },
      at,
    );
  }
  for (const a of answers) {
    journal.append(
      {
        op: a.against ? "resolve" : "attest",
        label: `${a.against ? "resolve" : "answer"} ${a.key}`,
        fact: {
          key: a.key,
          value: a.value,
          source: {
            kind: "attested",
            at: a.at,
            formId: a.formId,
            by: "human",
            ...(a.against ? { resolvedAgainst: a.against } : {}),
          },
        },
      },
      a.at,
    );
  }
  return journal;
}

export function rulesWith(months: number): RuleSet {
  return { ...DEFAULT_RULES, addressProofMaxAgeMonths: months };
}

export const VERDICT_ORDER = ["CONFLICT", "UNREADABLE", "EXPIRED", "ASKED"] as const;

export function humanDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
