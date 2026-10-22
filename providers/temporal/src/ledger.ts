import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * One row per document, appended to a JSONL file that is never rewritten.
 *
 * The digest is the identity of the document, not the file name. That is the
 * whole reason a resumed run cannot write a duplicate: an activity that is
 * retried, or replayed after the worker was killed, sees the digest already in
 * the ledger and stops.
 */
export interface LedgerRow {
  file: string;
  digest: string;
  kind: string;
  facts: number;
  readable: boolean;
  readAt: string;
  /** Which attempt wrote this row, for the write-up. */
  attempt: number;
}

export function parseLedger(text: string): LedgerRow[] {
  const lines = text.split("\n").filter((line) => line.trim().length > 0);

  return lines.flatMap((line, i) => {
    try {
      return [JSON.parse(line) as LedgerRow];
    } catch {
      // A power cut can leave half a line at the end. That row was never
      // acknowledged, so dropping it is correct. Damage anywhere else means the
      // file is wrong in a way nobody should paper over.
      if (i === lines.length - 1) return [];
      throw new Error(`night ledger is corrupt at line ${i + 1}`);
    }
  });
}

export function readLedger(path: string): LedgerRow[] {
  return existsSync(path) ? parseLedger(readFileSync(path, "utf8")) : [];
}

/** True when this document is already in the ledger, by content and not by name. */
export function alreadyRead(rows: LedgerRow[], digest: string): boolean {
  return rows.some((r) => r.digest === digest);
}

/** Appends only when the digest is new. Returns whether a line was written. */
export function appendOnce(path: string, row: LedgerRow): boolean {
  const rows = readLedger(path);
  if (alreadyRead(rows, row.digest)) return false;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(row)}\n`, "utf8");
  return true;
}
