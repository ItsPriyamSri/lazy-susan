import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_RULES,
  Index,
  Journal,
  annotateEssay,
  attributeFacts,
  composeDraft,
  planFill,
  runForm,
} from "@lazy-susan/core";
import type { EssayDraft, Fact, FormSpec, RuleSet, RunResult } from "@lazy-susan/core";
import { loadProfile } from "./profile.js";

const HERE = dirname(fileURLToPath(import.meta.url));
export const CORPUS = resolve(HERE, "../../../packages/corpus");
export const OUT = resolve(HERE, "../out");

export interface DocEntry {
  file: string;
  title: string;
  kind: string;
  issued?: string;
  pages: number;
  confidence: number;
  readable: boolean;
  facts: number;
  digest: string;
}

export interface AppState {
  index: Index;
  journal: Journal;
  docs: DocEntry[];
  forms: FormSpec[];
  /** When the run that produced the extractions happened. */
  readAt: string;
  counters: { documents: number; readable: number; facts: number; proposed: number; unplaced: number };
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export function loadState(): AppState {
  const extractionsDir = join(CORPUS, "extractions");
  const files = readdirSync(extractionsDir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .sort();

  const journal = new Journal();
  const docs: DocEntry[] = [];
  let readAt = new Date().toISOString();

  for (const file of files) {
    const e = readJson<{
      file: string;
      title: string;
      kind: string;
      issued?: string;
      pages: number;
      confidence: number;
      readable: boolean;
      digest: string;
      facts: Fact[];
      stats: { labelled: number; unplaced: unknown[] };
    }>(join(extractionsDir, file));

    docs.push({
      file: e.file,
      title: e.title,
      kind: e.kind,
      issued: e.issued,
      pages: e.pages,
      confidence: e.confidence,
      readable: e.readable,
      facts: e.facts.length,
      digest: e.digest,
    });

    journal.append(
      {
        op: "commit",
        label: `read ${e.file}`,
        facts: e.facts,
        documents: [
          {
            file: e.file,
            title: e.title,
            kind: e.kind as never,
            issued: e.issued,
            pages: e.pages,
            confidence: e.confidence,
            digest: e.digest,
          },
        ],
      },
      readAt,
    );
  }

  const summaryPath = join(extractionsDir, "_summary.json");
  const summary = (() => {
    try {
      return readJson<{ at: string; facts: number; proposed?: number; unplacedValues?: number }>(summaryPath);
    } catch {
      return undefined;
    }
  })();
  if (summary?.at) readAt = summary.at;

  // Your own details, read once. Attested, so they stay amber and stay weaker
  // than anything a document proves.
  const profile = loadProfile(undefined, readAt);
  for (const fact of profile.facts) {
    journal.append({ op: "attest", label: `profile ${fact.key}`, fact }, readAt);
  }
  if (profile.ignored.length > 0) {
    console.warn(`profile: ignored ${profile.ignored.join(", ")} — not keys this project knows`);
  }

  const formsDir = join(CORPUS, "forms");
  const forms = readdirSync(formsDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => readJson<FormSpec>(join(formsDir, f)));

  return {
    index: journal.rebuild(),
    journal,
    docs,
    forms,
    readAt,
    counters: {
      documents: docs.length,
      readable: docs.filter((d) => d.readable).length,
      facts: docs.reduce((n, d) => n + d.facts, 0),
      proposed: docs.reduce((n, d) => n + d.facts, 0) + (summary?.unplacedValues ?? 0),
      unplaced: summary?.unplacedValues ?? 0,
    },
  };
}

export function rulesWith(rules: Partial<RuleSet> | undefined): RuleSet {
  return { ...DEFAULT_RULES, ...(rules ?? {}) };
}

export function runOf(state: AppState, formId: string, rules: RuleSet): RunResult {
  const form = state.forms.find((f) => f.id === formId);
  if (!form) throw new Error(`no such form: ${formId}`);
  return runForm(form, state.index, rules, new Date().toISOString());
}

export interface EssayView {
  draft: EssayDraft;
  source: "model" | "templates";
  ms?: number;
  question: string;
}

/** Drafts the paragraph and then checks it, in that order of trust. */
export async function essayFor(
  state: AppState,
  formId: string,
  question: string,
  allowModel: boolean,
): Promise<EssayView> {
  const spec = state.forms.find((f) => f.id === formId);
  const maxWords = spec?.fields.find((f) => f.type === "textarea")?.maxWords ?? 200;

  const facts = state.index.facts
    .filter((f) => f.source.kind === "attested" || f.source.confidence >= 0.6)
    .map((f) => ({ key: f.key, value: f.value }));

  let text = "";
  let source: "model" | "templates" = "templates";
  let ms: number | undefined;

  try {
    const { draftEssay } = await import("@lazy-susan/gemma");
    const draft = await draftEssay(question, facts, maxWords, allowModel);
    text = draft.text;
    source = "model";
    ms = draft.ms;
  } catch (err) {
    console.error(`[essay] no model answer: ${(err as Error).message}`);
    text = composeDraft(facts);
  }

  if (!text) text = composeDraft(facts);
  const sentences = attributeFacts(text, facts);
  return { draft: annotateEssay(question, sentences, state.index, maxWords), source, ms, question };
}

export function planFor(state: AppState, formId: string, rules: RuleSet) {
  return planFill(runOf(state, formId, rules));
}
