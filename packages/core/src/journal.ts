import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { Index } from "./store.js";
import type { DocumentRecord, Fact } from "./types.js";

/**
 * Append-only journal.
 *
 * Undo is not "reverse the last change". It is "throw away the last entry and
 * replay the rest", which is the only version of undo that can be proved:
 * the index either hashes the same or it does not.
 */

export type Op =
  | { op: "commit"; label: string; facts: Fact[]; documents: DocumentRecord[] }
  | { op: "attest"; label: string; fact: Fact }
  | { op: "resolve"; label: string; fact: Fact };

export interface Entry {
  seq: number;
  at: string;
  op: Op;
  prev: string;
  hash: string;
}

export class Journal {
  entries: Entry[] = [];

  /** Appends and returns the new entry. `at` is injectable so runs are reproducible. */
  append(op: Op, at: string): Entry {
    const prev = this.entries.length ? this.entries[this.entries.length - 1]!.hash : "genesis";
    const seq = this.entries.length;
    const hash = bytesToHex(sha256(utf8ToBytes(`${seq}|${at}|${stable(op)}|${prev}`)));
    const entry: Entry = { seq, at, op, prev, hash };
    this.entries.push(entry);
    return entry;
  }

  /** Rebuilds the index by replaying every entry in order. */
  rebuild(): Index {
    const index = new Index();
    for (const e of this.entries) applyOp(index, e.op);
    return index;
  }

  /** Drops the last entry, replays the rest, and returns both. */
  undo(): { removed: Entry | undefined; index: Index } {
    const removed = this.entries.pop();
    return { removed, index: this.rebuild() };
  }

  /** Walks the chain. A single edited entry breaks every hash after it. */
  verify(): { ok: boolean; brokenAt?: number } {
    let prev = "genesis";
    for (const e of this.entries) {
      const expected = bytesToHex(sha256(utf8ToBytes(`${e.seq}|${e.at}|${stable(e.op)}|${prev}`)));
      if (e.hash !== expected || e.prev !== prev) return { ok: false, brokenAt: e.seq };
      prev = e.hash;
    }
    return { ok: true };
  }

  head(): string {
    return this.entries.length ? this.entries[this.entries.length - 1]!.hash : "genesis";
  }
}

export function applyOp(index: Index, op: Op): void {
  if (op.op === "commit") {
    for (const d of op.documents) index.addDocument(d);
    for (const f of op.facts) index.addFact(f);
    return;
  }
  index.attest(op.fact);
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`).join(",")}}`;
}
