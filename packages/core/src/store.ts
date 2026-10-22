import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import type { DocumentKind, DocumentRecord, Fact, Source } from "./types.js";

/**
 * The fact index.
 *
 * A fact is a value plus a pointer to where it came from. Nothing enters the
 * index without a source, and nothing leaves it without being journaled.
 */
export class Index {
  facts: Fact[] = [];
  documents: DocumentRecord[] = [];

  addFact(fact: Fact): void {
    const dup = this.facts.some(
      (f) =>
        f.key === fact.key &&
        f.value === fact.value &&
        f.source.kind === "document" &&
        fact.source.kind === "document" &&
        f.source.file === fact.source.file &&
        f.source.page === fact.source.page,
    );
    if (dup) return;
    this.facts.push(fact);
  }

  addDocument(doc: DocumentRecord): void {
    if (!this.documents.some((d) => d.file === doc.file)) this.documents.push(doc);
  }

  /** An attestation replaces any earlier attestation for the same key. */
  attest(fact: Fact): void {
    this.facts = this.facts.filter(
      (f) => !(f.key === fact.key && f.source.kind === "attested"),
    );
    this.facts.push(fact);
  }

  byKey(key: string): Fact[] {
    return this.facts.filter((f) => f.key === key);
  }

  documentFacts(key: string): Fact[] {
    return this.byKey(key).filter((f) => f.source.kind === "document");
  }

  attestedFor(key: string): Fact | undefined {
    return this.byKey(key).find((f) => f.source.kind === "attested");
  }

  /** Distinct document values for a key, in insertion order. */
  distinctValues(key: string): { value: string; source: Source }[] {
    const seen = new Set<string>();
    const out: { value: string; source: Source }[] = [];
    for (const f of this.documentFacts(key)) {
      const norm = normalise(f.value);
      if (seen.has(norm)) continue;
      seen.add(norm);
      out.push({ value: f.value, source: f.source });
    }
    return out;
  }

  docsOfKind(kind: DocumentKind): DocumentRecord[] {
    return this.documents.filter((d) => d.kind === kind);
  }

  /** Stable text form. Two indexes with the same content hash the same. */
  canonical(): string {
    const facts = [...this.facts]
      .map((f) => `${f.key}\u0001${f.value}\u0001${sourceKey(f.source)}`)
      .sort();
    const docs = [...this.documents]
      .map((d) => `${d.file}\u0001${d.kind}\u0001${d.issued ?? ""}\u0001${d.digest}`)
      .sort();
    return JSON.stringify({ docs, facts });
  }

  hash(): string {
    return bytesToHex(sha256(utf8ToBytes(this.canonical())));
  }

  clone(): Index {
    const i = new Index();
    i.facts = this.facts.map((f) => ({ ...f }));
    i.documents = this.documents.map((d) => ({ ...d }));
    return i;
  }

  toJSON(): { facts: Fact[]; documents: DocumentRecord[] } {
    return { facts: this.facts, documents: this.documents };
  }

  static fromJSON(data: { facts: Fact[]; documents: DocumentRecord[] }): Index {
    const i = new Index();
    i.facts = data.facts.map((f) => ({ ...f }));
    i.documents = data.documents.map((d) => ({ ...d }));
    return i;
  }
}

export function normalise(v: string): string {
  return v.toLowerCase().replace(/\s+/g, " ").replace(/[.,;:]+$/g, "").trim();
}

function sourceKey(s: Source): string {
  if (s.kind === "document") {
    const b = s.bbox;
    return `d:${s.file}:${s.page}:${b.x.toFixed(4)},${b.y.toFixed(4)},${b.w.toFixed(4)},${b.h.toFixed(4)}`;
  }
  return `a:${s.at}:${s.formId}:${s.by}:${s.resolvedAgainst ?? ""}`;
}
