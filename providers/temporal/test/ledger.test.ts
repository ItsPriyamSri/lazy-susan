import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { alreadyRead, appendOnce, parseLedger, readLedger } from "../src/ledger.js";
import type { LedgerRow } from "../src/ledger.js";

const row = (digest: string, file = "passport.pdf", attempt = 1): LedgerRow => ({
  file,
  digest,
  kind: "identity",
  facts: 5,
  readable: true,
  readAt: "2026-10-22T00:00:00.000Z",
  attempt,
});

describe("the night ledger", () => {
  it("reads back one row per line", () => {
    const text = `${JSON.stringify(row("a"))}\n${JSON.stringify(row("b", "lease.pdf"))}\n`;
    expect(parseLedger(text)).toHaveLength(2);
  });

  it("ignores the blank line a file ends with", () => {
    expect(parseLedger(`${JSON.stringify(row("a"))}\n\n`)).toHaveLength(1);
  });

  it("treats a document as read by its bytes, not by its name", () => {
    const rows = [row("a", "passport.pdf")];
    expect(alreadyRead(rows, "a")).toBe(true);
    expect(alreadyRead(rows, "b")).toBe(false);
  });

  it("does not write the same document twice, which is what a retry does", () => {
    const dir = mkdtempSync(join(tmpdir(), "ledger-"));
    const path = join(dir, "night.jsonl");

    expect(appendOnce(path, row("a"))).toBe(true);
    // The same document, re-read by a restarted worker, one attempt later.
    expect(appendOnce(path, row("a", "passport.pdf", 2))).toBe(false);

    expect(readLedger(path)).toHaveLength(1);
  });

  it("keeps documents that genuinely differ", () => {
    const dir = mkdtempSync(join(tmpdir(), "ledger-"));
    const path = join(dir, "night.jsonl");

    appendOnce(path, row("a", "passport.pdf"));
    appendOnce(path, row("b", "lease.pdf"));

    expect(readLedger(path).map((r) => r.file)).toEqual(["passport.pdf", "lease.pdf"]);
  });

  it("treats a missing ledger as an empty one", () => {
    const dir = mkdtempSync(join(tmpdir(), "ledger-"));
    expect(readLedger(join(dir, "nothing.jsonl"))).toEqual([]);
  });

  it("drops half a line left by a crash, because that row was never acknowledged", () => {
    const dir = mkdtempSync(join(tmpdir(), "ledger-"));
    const path = join(dir, "night.jsonl");
    writeFileSync(path, `${JSON.stringify(row("a"))}\n{"file":"half`);
    expect(readLedger(path)).toHaveLength(1);
  });

  it("refuses to paper over damage in the middle of the file", () => {
    const dir = mkdtempSync(join(tmpdir(), "ledger-"));
    const path = join(dir, "night.jsonl");
    writeFileSync(path, `{"file":"half\n${JSON.stringify(row("a"))}\n`);
    expect(() => readLedger(path)).toThrow(/corrupt/);
  });
});
