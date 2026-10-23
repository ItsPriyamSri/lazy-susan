/**
 * Types for what the brain returns. Nothing here is invented: every property
 * was observed in a payload from the running server. Optional properties are
 * optional because the server does not always send them.
 */

export type Verdict = "FILLED" | "ASKED" | "CONFLICT" | "EXPIRED" | "UNREADABLE";

export type FieldType = "text" | "date" | "email" | "tel" | "select" | "textarea" | "file";

export type DocumentKind =
  | "identity"
  | "address_proof"
  | "income_proof"
  | "education"
  | "reference"
  | "resume"
  | "other";

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Normalised 0..1, origin top-left. */
export interface DocumentSource {
  kind: "document";
  file: string;
  page: number;
  bbox: BBox;
  confidence: number;
  line?: number;
  excerpt?: string;
}

export interface AttestedSource {
  kind: "attested";
  at: string;
  formId: string;
  by: string;
  resolvedAgainst?: string;
}

export type Source = DocumentSource | AttestedSource;

export interface FieldSpec {
  id: string;
  label: string;
  key: string;
  type: FieldType;
  required: boolean;
  maxWords?: number;
  accept?: string;
}

export interface Candidate {
  value: string;
  file: string;
  issued?: string;
}

export interface FieldResult {
  field: FieldSpec;
  verdict: Verdict;
  value?: string;
  reason: string;
  source?: Source;
  candidates?: Candidate[];
}

export interface Counts {
  FILLED: number;
  ASKED: number;
  CONFLICT: number;
  EXPIRED: number;
  UNREADABLE: number;
}

export interface Run {
  formId: string;
  formTitle: string;
  at: string;
  rules: {
    addressProofMaxAgeMonths: number;
    identityMustBeValidOn: string;
    minConfidence: number;
    requireIncomeProof: boolean;
  };
  fields: FieldResult[];
  counts: Counts;
  askList: FieldResult[];
  indexHash: string;
  /** The build contract names this; the running server does not always send it. */
  hash?: string;
}

export interface FormResponse {
  run: Run;
  rules?: Run["rules"];
}

export interface DocumentSummary {
  file: string;
  title?: string;
  kind: string;
  issued?: string;
  pages: number;
  confidence: number;
  readable: boolean;
  facts: number;
  digest: string;
}

export interface ApiState {
  readAt: string;
  counters: {
    documents: number;
    readable: number;
    facts: number;
    proposed: number;
    unplaced: number;
  };
  documents: DocumentSummary[];
  forms: { id: string; title: string; kind: string; fields: number }[];
  indexHash: string;
  journal: {
    entries: number;
    head: string;
    verified: { ok: boolean; brokenAt?: number };
  };
  context: { text: string; savedAt?: string };
  keys: Record<string, string>;
  /** deployment is present on the health payload; tolerated here when absent. */
  deployment?: {
    configured: boolean;
    keys?: { key: string; set: boolean }[];
  };
}

export interface HealthResponse {
  ok: boolean;
  documents?: number;
  deployment?: ApiState["deployment"];
}

export interface AnnotatedSentence {
  text: string;
  supported: boolean;
  usedKeys: string[];
  reason: string;
}

export interface EssayDraft {
  question: string;
  accepted: AnnotatedSentence[];
  struck: AnnotatedSentence[];
  text: string;
  wordCount: number;
  refused?: string;
  refusedKind?: "no-facts" | "thin";
}

export interface EssayResponse {
  draft: EssayDraft;
  source: "model" | "templates";
  question: string;
  ms?: number;
}

export interface AnswerResponse {
  ok: boolean;
  indexHash: string;
  already?: boolean;
}

export interface UndoResponse {
  ok: boolean;
  removed: { seq: number; label: string; hash: string } | null;
  before: string;
  after: string;
}

export interface Outcome {
  handle: string;
  label: string;
  key: string | null;
  type: string;
  tag: string;
  status: "filled" | "open" | "not-ours";
  value?: string;
  reason?: string;
}

export interface PortalPlan {
  values?: Record<string, string>;
  open?: Record<string, string>;
  files?: Record<string, string>;
  byLabel?: Record<string, string>;
}

export interface PortalResponse {
  id: string;
  formId?: string;
  mode: string;
  liveView?: string;
  url: string;
  outcomes: Outcome[];
  /** Base64 of a PNG screenshot; empty string when there is nothing to show. */
  screenshot?: string;
  plan?: PortalPlan;
  error?: string;
}

export interface FillResponse {
  kind: "pdf" | "html";
  file: string;
  url: string;
  filled?: number;
  missing?: string[];
  plan?: { blocked?: string[] };
}

export interface DocumentTextResponse {
  file: string;
  format: "text" | "pdf";
  lines: string[];
}

export interface UploadResponse {
  file: string;
  kind: string;
  readable: boolean;
  facts: number;
  unplaced: number;
  extraction: {
    facts?: { key: string; value: string }[];
    stats?: { unplaced?: string[] };
  };
}

export interface BriefResponse {
  spoken: boolean;
  script: string;
}
