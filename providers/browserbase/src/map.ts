import { guessKey, isKnownKey, parseDate, toISO } from "@lazy-susan/core";
import type { Control } from "./controls.js";
import { labelFor } from "./controls.js";

/**
 * From a box on a page to a key in the index.
 *
 * Order matters, and it is deliberately boring: an exact key name, then the
 * label rules that already map documents, then nothing. The model only enters
 * when a caller passes it in, and only for labels neither of the first two can
 * place.
 */

export function keyFor(control: Control): string | null {
  for (const raw of [control.name, control.id]) {
    if (raw && isKnownKey(raw)) return raw;
  }

  // "full_name" and "referee-mobile" are labels written by a developer.
  const asWords = `${control.name} ${control.id}`.replace(/[_\-.[\]]+/g, " ").trim();

  return guessKey(`${labelFor(control)} ${asWords}`.trim());
}

export type Coerced = { ok: true; value: string; note?: string } | { ok: false; reason: string };

const normalise = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * A value is only usable if the control can hold it. "14 MAR 2003" is a fine
 * fact and a bad `<input type="date">` value; the page wants 2003-03-14.
 */
export function coerce(control: Control, raw: string): Coerced {
  const value = raw.trim();
  if (!value) return { ok: false, reason: "nothing to put in it" };

  if (control.tag === "input" && control.type === "date") {
    const parsed = parseDate(value);
    if (!parsed) return { ok: false, reason: `"${value}" is not a date the page can read` };
    return { ok: true, value: toISO(parsed) };
  }

  if (control.tag === "input" && control.type === "number") {
    const number = value.replace(/[^0-9.\-]/g, "");
    if (!number || Number.isNaN(Number(number))) {
      return { ok: false, reason: `"${value}" is not a number` };
    }
    return { ok: true, value: number };
  }

  if (control.tag === "input" && control.type === "checkbox") {
    return { ok: true, value: /^(yes|true|y|1|✓)$/i.test(value) ? "true" : "false" };
  }

  if (control.tag === "select") {
    const wanted = normalise(value);
    const option = (control.options ?? []).find((o) => normalise(o) === wanted);
    if (option) return { ok: true, value: option };

    const partial = (control.options ?? []).find(
      (o) => normalise(o).includes(wanted) || wanted.includes(normalise(o)),
    );
    if (partial) return { ok: true, value: partial, note: `matched the option "${partial}"` };

    return { ok: false, reason: `the list has no "${value}"; it offers ${(control.options ?? []).join(", ")}` };
  }

  return { ok: true, value };
}
