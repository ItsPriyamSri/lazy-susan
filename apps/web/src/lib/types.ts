import type { DocumentRecord, EssayDraft, Fact, FormSpec } from "@lazy-susan/core";

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

export interface Mapping {
  byField: Record<string, { key: string | null; source: string; raw?: string }>;
  stats: { fields: number; modelExact: number; modelRepaired: number; rules: number; unmatched: number };
  model: string;
}

export interface ReplayForm {
  spec: FormSpec;
  mapping: Mapping;
}

export interface ReplayData {
  generatedAt: string;
  readAt: string;
  counters: { documents: number; readable: number; facts: number; proposed: number; unplaced: number };
  documents: DocEntry[];
  index: { facts: Fact[]; documents: DocumentRecord[] };
  forms: ReplayForm[];
  essays: Record<string, { draft: EssayDraft; source: string; question: string }>;
  journal: { entries: number; head: string; verified: { ok: boolean; brokenAt?: number } };
}
