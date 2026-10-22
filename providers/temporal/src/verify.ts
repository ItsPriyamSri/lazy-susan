import { readdirSync } from "node:fs";
import { DOCS_DIR, EXTRACTIONS_DIR, LEDGER, extractionPath } from "./paths.js";
import { readLedger } from "./ledger.js";
import { readFileSync, existsSync } from "node:fs";

/**
 * Checks the thing the workflow promises: every document was read exactly once,
 * whatever happened to the worker in the middle.
 */
function main(): number {
  const files = readdirSync(DOCS_DIR)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .sort();
  const rows = readLedger(LEDGER);

  const byDigest = new Map<string, number>();
  for (const row of rows) byDigest.set(row.digest, (byDigest.get(row.digest) ?? 0) + 1);
  const duplicates = [...byDigest.entries()].filter(([, n]) => n > 1);

  const readFiles = new Set(rows.map((r) => r.file));
  const missing = files.filter((f) => !readFiles.has(f));

  const neverWritten = files.filter((f) => !existsSync(extractionPath(f)));

  const attempts = rows.reduce<Record<number, number>>((acc, r) => {
    acc[r.attempt] = (acc[r.attempt] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`ledger            ${LEDGER}`);
  console.log(`documents         ${files.length}`);
  console.log(`ledger rows       ${rows.length}`);
  console.log(`distinct digests  ${byDigest.size}`);
  console.log(`duplicates        ${duplicates.length}`);
  console.log(`missing           ${missing.length}${missing.length ? ` (${missing.join(", ")})` : ""}`);
  console.log(`no extraction     ${neverWritten.length}`);
  console.log(`rows by attempt   ${Object.entries(attempts).map(([a, n]) => `attempt ${a}: ${n}`).join(", ")}`);

  let facts = 0;
  let unplaced = 0;
  for (const f of files) {
    if (!existsSync(extractionPath(f))) continue;
    const e = JSON.parse(readFileSync(extractionPath(f), "utf8")) as {
      facts: unknown[];
      stats: { unplaced: unknown[] };
    };
    facts += e.facts.length;
    unplaced += e.stats.unplaced.length;
  }
  console.log(`facts             ${facts}`);
  console.log(`unplaced          ${unplaced}`);

  const ok = duplicates.length === 0 && missing.length === 0 && neverWritten.length === 0 && rows.length === files.length;
  console.log(`\n${ok ? "ok" : "FAILED"}: every document read exactly once`);
  return ok ? 0 : 1;
}

process.exit(main());
