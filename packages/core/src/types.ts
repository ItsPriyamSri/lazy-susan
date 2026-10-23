/**
 * The vocabulary of the whole project.
 *
 * One rule matters more than the rest: a value on a form is either traced to
 * a rectangle on a page, or it was typed and signed by a person. There is no
 * third way, and there is no "probably".
 */

export type DocumentKind =
  | "identity"
  | "address_proof"
  | "income_proof"
  | "education"
  | "reference"
  | "resume"
  | "other";

export type Verdict = "FILLED" | "ASKED" | "CONFLICT" | "EXPIRED" | "UNREADABLE";

/** Normalised 0..1, origin top-left. Stored so a value can be pointed at. */
export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DocumentRecord {
  file: string;
  /** What the document calls itself, e.g. "Statement of Grades". */
  title?: string;
  kind: DocumentKind;
  /** ISO date the document was issued, when it has one. */
  issued?: string;
  pages: number;
  /** The reader's confidence in its own read of this file, 0..1. */
  confidence: number;
  /** sha256 of the file bytes, used to dedupe and to detect a re-scan. */
  digest: string;
}

export type Source =
  | {
      kind: "document";
      file: string;
      page: number;
      bbox: BBox;
      confidence: number;
      /**
       * For a file with no page geometry (text, docx): the 1-based line the
       * value was read from, and the line itself. A rectangle is the strongest
       * pointer; a line is the same idea for a file that has no pages.
       */
      line?: number;
      excerpt?: string;
    }
  | {
      kind: "attested";
      at: string;
      formId: string;
      by: "human" | "human+model";
      /** For a conflict resolution: the file this value was chosen against. */
      resolvedAgainst?: string;
    };

export interface Fact {
  key: string;
  value: string;
  source: Source;
}

export type FieldType = "text" | "date" | "email" | "tel" | "select" | "textarea" | "file";

export interface FieldSpec {
  /** DOM name or AcroForm field name. Must match the fixture. */
  id: string;
  /** The form's own wording. The ask card shows this, never a label we invented. */
  label: string;
  key: string;
  type: FieldType;
  required: boolean;
  maxWords?: number;
  /** For `type: "file"`: which document kind fills this slot. */
  accept?: DocumentKind;
  options?: string[];
  hint?: string;
}

export interface FormSpec {
  id: string;
  title: string;
  kind: "pdf" | "html";
  /** The date the form is being submitted, used for expiry rules. */
  submissionDate: string;
  fields: FieldSpec[];
  /** A paragraph question is answered from facts, never invented. */
  essays?: EssaySpec[];
}

export interface EssaySpec {
  id: string;
  label: string;
  key: string;
  maxWords: number;
}

export interface RuleSet {
  /** A utility bill older than this is not proof of address. */
  addressProofMaxAgeMonths: number;
  /** Identity documents must still be valid on this date. */
  identityMustBeValidOn: string;
  /** Below this, an extraction becomes a question instead of a value. */
  minConfidence: number;
  /** An income field may only be fed by an income document. */
  requireIncomeProof: boolean;
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
  /** One sentence, shown to the user. Never a stack trace. */
  reason: string;
  source?: Source;
  candidates?: Candidate[];
  /** True when the value came from the user, not from a document. */
  weak?: boolean;
}

export interface Counts {
  FILLED: number;
  ASKED: number;
  CONFLICT: number;
  EXPIRED: number;
  UNREADABLE: number;
}

export interface RunResult {
  formId: string;
  formTitle: string;
  at: string;
  rules: RuleSet;
  fields: FieldResult[];
  counts: Counts;
  askList: FieldResult[];
  /** sha256 of the fact index at the end of the run. */
  indexHash: string;
}

export interface EssaySentence {
  text: string;
  /** Facts the writer claims this sentence rests on. */
  supports: string[];
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
  /**
   * `no-facts` means nothing in the folder or the notes relates to this
   * question, so it is the person's to answer. `thin` means something relates,
   * but not enough to write a paragraph without padding.
   */
  refusedKind?: "no-facts" | "thin";
}
