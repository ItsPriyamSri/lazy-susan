import { parseDate, toISO } from "./dates.js";
import type { FieldResult, RunResult } from "./types.js";

export interface FillPatch {
  fieldId: string;
  value: string;
}

export interface FillPlan {
  patches: FillPatch[];
  attachments: { fieldId: string; file: string }[];
  questions: { fieldId: string; label: string; reason: string; verdict: string }[];
  /** Reasons the submit button stays disabled. Empty means a human may sign. */
  blocked: string[];
}

/**
 * Turns a resolved run into a set of edits. Deliberately dumb: it does not
 * decide anything, it only writes down what the run already decided.
 */
export function planFill(run: RunResult): FillPlan {
  const patches: FillPatch[] = [];
  const attachments: { fieldId: string; file: string }[] = [];
  const questions: FillPlan["questions"] = [];
  const blocked: string[] = [];

  for (const r of run.fields) {
    if (r.verdict === "FILLED" && r.value !== undefined) {
      if (r.field.type === "file") attachments.push({ fieldId: r.field.id, file: r.value });
      else patches.push({ fieldId: r.field.id, value: formatValue(r) });
      continue;
    }
    questions.push({
      fieldId: r.field.id,
      label: r.field.label,
      reason: r.reason,
      verdict: r.verdict,
    });
    if (r.field.required) blocked.push(`${r.field.label}: ${r.reason}`);
  }

  return { patches, attachments, questions, blocked };
}

export function formatValue(r: FieldResult): string {
  const raw = r.value ?? "";
  if (r.field.type === "date") {
    const d = parseDate(raw);
    return d ? toISO(d) : raw;
  }
  if (r.field.type === "select" && r.field.options?.length) {
    const hit = r.field.options.find((o) => o.toLowerCase() === raw.toLowerCase());
    return hit ?? raw;
  }
  return raw;
}

/** Nothing required may be missing. The agent never overrides this. */
export function canSubmit(run: RunResult): boolean {
  return planFill(run).blocked.length === 0;
}
