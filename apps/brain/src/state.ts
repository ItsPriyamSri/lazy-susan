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
  needsYou,
  planFill,
  runForm,
} from "@lazy-susan/core";
import type { EssayDraft, Fact, FormSpec, RuleSet, RunResult } from "@lazy-susan/core";
import { loadProfile } from "./profile.js";
import { readContext } from "./context.js";

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
  /** The paragraph the person wrote about themselves, if any. */
  context: { text: string; savedAt?: string };
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

  // The paragraph about you. One attested fact, because it is your word, and
  // because the essay checker needs something to trace a sentence to.
  const context = readContext();
  if (context.text.trim()) {
    journal.append(
      {
        op: "attest",
        label: "about you",
        fact: {
          key: "person.context",
          value: context.text.trim(),
          source: { kind: "attested", at: context.savedAt ?? readAt, formId: "context", by: "human" },
        },
      },
      readAt,
    );
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
    context: { text: context.text, savedAt: context.savedAt },
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

  // Some questions are not in the folder and never will be: they are about the
  // company. Refuse before the model gets a chance to pad them.
  if (needsYou(question)) {
    return {
      draft: {
        question,
        accepted: [],
        struck: [],
        text: "",
        wordCount: 0,
        refusedKind: "no-facts",
        refused:
          "This question is about the company, and nothing in your folder or notes is about the company. It is yours to answer.",
      },
      source: "templates",
      question,
    };
  }

  const facts = state.index.facts
    .filter((f) => f.source.kind === "attested" || f.source.confidence >= 0.6)
    .map((f) => ({ key: f.key, value: f.value }));

  let text = "";
  let source: "model" | "templates" = "templates";
  let ms: number | undefined;

  try {
    const { draftEssay } = await import("@lazy-susan/gemma");
    const draft = await draftEssay(question, facts, maxWords, allowModel, state.context.text);
    text = draft.text;
    source = "model";
    ms = draft.ms;
  } catch (err) {
    console.error(`[essay] no model answer: ${(err as Error).message}`);
    text = composeDraft(facts);
  }

  if (!text) text = composeDraft(facts);

  // With no model, the person's own paragraph is still the best sentence in
  // the box. It is quoted, not paraphrased: their words, on the record.
  if (source === "templates" && state.context.text.trim()) {
    const lead = state.context.text
      .trim()
      .split(/(?<=[.!?])\s+/)
      .slice(0, 2)
      .join(" ")
      .split(/\s+/)
      .slice(0, 60)
      .join(" ");
    text = `${lead} ${text}`.trim();
  }
  const sentences = attributeFacts(text, facts);
  return { draft: annotateEssay(question, sentences, state.index, maxWords), source, ms, question };
}

export function planFor(state: AppState, formId: string, rules: RuleSet) {
  return planFill(runOf(state, formId, rules));
}
