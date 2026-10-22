import { KEY, guessKey, isKnownKey } from "@lazy-susan/core";
import { extractJson, generate } from "./ollama.js";

export interface FormField {
  id: string;
  label: string;
}

export type MapSource = "model" | "model-repaired" | "rules" | "none";

export interface Mapping {
  byField: Record<string, { key: string | null; source: MapSource; raw?: string }>;
  stats: {
    fields: number;
    modelExact: number;
    modelRepaired: number;
    rules: number;
    unmatched: number;
  };
  model: string;
  ms: number;
}

const KEY_LIST = Object.values(KEY);

/**
 * Asks the local model which of the eleven facts each form field is asking for.
 *
 * This is the job the model is good at: a form nobody wrote a rule for. The
 * answer is then checked against the key list, and anything the model gets
 * wrong falls back to matching the label's own words.
 */
export async function mapForm(fields: FormField[], allowModel = true): Promise<Mapping> {
  const prompt = [
    "You assign form fields to facts.",
    `Reply with ONLY a JSON array of exactly ${fields.length} strings, one per field, in order.`,
    'Example for two fields: ["person.full_name","person.dob"]',
    'If no fact fits a field, use the string "none".',
    "",
    "Facts you may use:",
    KEY_LIST.join(", "),
    "",
    "Fields, in order:",
    ...fields.map((f, i) => `${i + 1}. ${f.label}`),
  ].join("\n");

  const reply = await generate(prompt, { allowModel, numPredict: 220 });
  const parsed = extractJson<unknown>(reply.response);
  const answers = toAnswers(parsed, fields.length);

  const byField: Mapping["byField"] = {};
  const stats = { fields: fields.length, modelExact: 0, modelRepaired: 0, rules: 0, unmatched: 0 };

  fields.forEach((field, i) => {
    const raw = (answers[i] ?? "").trim();

    if (raw && isKnownKey(raw)) {
      byField[field.id] = { key: raw, source: "model", raw };
      stats.modelExact++;
      return;
    }

    const repaired = repair(raw);
    if (repaired) {
      byField[field.id] = { key: repaired, source: "model-repaired", raw };
      stats.modelRepaired++;
      return;
    }

    const guessed = guessKey(field.label);
    if (guessed) {
      byField[field.id] = { key: guessed, source: "rules", raw };
      stats.rules++;
      return;
    }

    byField[field.id] = { key: null, source: "none", raw };
    stats.unmatched++;
  });

  return { byField, stats, model: reply.model, ms: reply.ms };
}

/** Accepts either an ordered array or a 1-based object, because models vary. */
export function toAnswers(parsed: unknown, fields: number): string[] {
  if (Array.isArray(parsed)) return parsed.map((v) => (typeof v === "string" ? v : ""));
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    return Array.from({ length: fields }, (_, i) => {
      const v = obj[String(i + 1)];
      return typeof v === "string" ? v : "";
    });
  }
  return Array.from({ length: fields }, () => "");
}

/** Repairs the model's near-misses: a stray "person." prefix, a quoted word. */
export function repair(raw: string): string | null {
  const clean = raw
    .toLowerCase()
    .replace(/[`"'\s]/g, "")
    .replace(/^key:/, "");
  if (!clean || clean === "none") return null;
  if (isKnownKey(clean)) return clean;

  for (const key of KEY_LIST) {
    const k = key.toLowerCase();
    if (clean.endsWith(`.${k}`) || k.endsWith(`.${clean}`)) return key;
    if (clean.replace(/_/g, ".") === k) return key;
  }
  return null;
}
