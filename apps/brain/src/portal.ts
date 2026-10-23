import { join } from "node:path";
import { existsSync } from "node:fs";
import type { FormSpec, Index, RunResult } from "@lazy-susan/core";
import { normaliseLabel, openPortal } from "@lazy-susan/browserbase";
import type { Outcome, PagePlan, PortalSession } from "@lazy-susan/browserbase";
import { CORPUS } from "./state.js";

/**
 * The browser runs, kept per id.
 *
 * A run stays open because a person finishes a form slowly: the machine types
 * what it can prove, then you type the rest, then it types that too. Closing on
 * a timer is the only cleanup that matters; a leaked session is a browser left
 * open on a machine nobody is watching.
 */

export interface PortalRun {
  id: string;
  formId: string;
  startedAt: number;
  session: PortalSession;
  outcomes: Outcome[];
}

const runs = new Map<string, PortalRun>();

/** Fields the index can prove, and fields that need a human, in page terms. */
export function planFromRun(run: RunResult): PagePlan {
  const plan: PagePlan = { values: {}, open: {}, files: {} };

  for (const result of run.fields) {
    const key = result.field.key;

    if (result.verdict === "FILLED" && result.value) {
      if (key.startsWith("documents.")) {
        const path = join(CORPUS, "docs", result.value);
        if (existsSync(path)) plan.files![key] = path;
      } else {
        plan.values[key] = result.value;
      }
      continue;
    }

    plan.open[key] = result.reason ?? "nothing in the folder carries this";
  }

  return plan;
}

/**
 * A page with no form spec: everything the index can prove, and a conflict
 * wherever two documents disagree. The rules that need a form (how old a
 * document may be) do not run here, and the interface says so.
 */
export function planFromIndex(index: Index): PagePlan {
  const plan: PagePlan = { values: {}, open: {}, files: {} };
  const keys = [...new Set(index.facts.map((f) => f.key))].sort();

  for (const key of keys) {
    const attested = index.attestedFor(key);
    if (attested) {
      plan.values[key] = attested.value;
      continue;
    }

    const distinct = index.distinctValues(key);
    if (distinct.length === 1) {
      const fact = distinct[0]!;
      if (key.startsWith("documents.")) {
        const path = join(CORPUS, "docs", fact.value);
        if (existsSync(path)) plan.files![key] = path;
      } else {
        plan.values[key] = fact.value;
      }
      continue;
    }

    if (distinct.length > 1) {
      plan.open[key] = `Two documents disagree: ${distinct.map((d) => d.value).join(" and ")}.`;
    }
  }

  return plan;
}

/** The form's own wording → its key, for controls no rule could name. */
export function labelsFor(spec: FormSpec): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of spec.fields) out[normaliseLabel(field.label)] = field.key;
  return out;
}

export async function startPortal(input: {
  url: string;
  formId: string;
  plan: PagePlan;
}): Promise<PortalRun> {
  const session = await openPortal({ url: input.url, keepAlive: true });
  const outcomes = await session.apply(input.plan);

  const run: PortalRun = {
    id: session.id,
    formId: input.formId,
    startedAt: Date.now(),
    session,
    outcomes,
  };

  runs.set(run.id, run);
  return run;
}

export async function refillPortal(id: string, plan: PagePlan): Promise<PortalRun | null> {
  const run = runs.get(id);
  if (!run) return null;
  run.outcomes = await run.session.apply(plan);
  return run;
}

export async function closePortal(id: string): Promise<boolean> {
  const run = runs.get(id);
  if (!run) return false;
  await run.session.close();
  runs.delete(id);
  return true;
}

export function runFor(id: string): PortalRun | undefined {
  return runs.get(id);
}

/** Closes anything older than `minutes`. Called on a timer by the server. */
export async function reapPortals(minutes = 15): Promise<number> {
  const cutoff = Date.now() - minutes * 60_000;
  let closed = 0;
  for (const [id, run] of runs) {
    if (run.startedAt < cutoff) {
      await run.session.close().catch(() => {});
      runs.delete(id);
      closed += 1;
    }
  }
  return closed;
}

export async function closeAllPortals(): Promise<void> {
  for (const [id, run] of runs) {
    await run.session.close().catch(() => {});
    runs.delete(id);
  }
}
