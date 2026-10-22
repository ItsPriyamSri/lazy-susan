import { Context } from "@temporalio/activity";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { readOne } from "@lazy-susan/reader";
import { DOCS_DIR, EXTRACTIONS_DIR, LEDGER, extractionPath } from "./paths.js";
import { appendOnce } from "./ledger.js";
import { initSentry, withSpan } from "@lazy-susan/sentry";

export interface ReadInput {
  file: string;
  /** Used only so two different nights can be told apart in the log. */
  night: string;
}

export interface ReadResult {
  file: string;
  digest: string;
  facts: number;
  readable: boolean;
  /** False when the document was already in the ledger and nothing was written. */
  written: boolean;
}

/**
 * Reads one PDF and records it. This is the only activity that touches a file.
 *
 * It is safe to run twice. The digest is of the bytes, so a retry after a crash
 * recognises its own earlier work and writes nothing.
 */
export async function readDocument(input: ReadInput): Promise<ReadResult> {
  initSentry();
  const attempt = Context.current().info.attempt;
  const pace = Number(process.env.NIGHT_PACE_MS ?? 0);

  const extraction = await withSpan(`read ${input.file}`, "document", async () => readOne(DOCS_DIR, input.file));

  // A deliberate pause so a human can kill the worker mid-run and watch what
  // happens next. Zero in normal use.
  if (pace > 0) await new Promise((r) => setTimeout(r, pace));

  const target = extractionPath(input.file);
  mkdirSync(EXTRACTIONS_DIR, { recursive: true });
  const temp = `${target}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(extraction, null, 2));
  renameSync(temp, target);

  const written = appendOnce(LEDGER, {
    file: extraction.file,
    digest: extraction.digest,
    kind: extraction.kind,
    facts: extraction.facts.length,
    readable: extraction.readable,
    readAt: new Date().toISOString(),
    attempt,
  });

  return {
    file: extraction.file,
    digest: extraction.digest,
    facts: extraction.facts.length,
    readable: extraction.readable,
    written,
  };
}

/** Writes the summary the app reads, once every document is in. */
export async function finishNight(night: string): Promise<{ at: string }> {
  const { readdirSync, readFileSync } = await import("node:fs");
  const files = readdirSync(EXTRACTIONS_DIR).filter((f) => f.endsWith(".json") && !f.startsWith("_"));

  let facts = 0;
  let readable = 0;
  let unplaced = 0;
  for (const f of files) {
    const e = JSON.parse(readFileSync(`${EXTRACTIONS_DIR}/${f}`, "utf8")) as {
      facts: unknown[];
      readable: boolean;
      stats: { unplaced: unknown[] };
    };
    facts += e.facts.length;
    if (e.readable) readable += 1;
    unplaced += e.stats.unplaced.length;
  }

  const summary = {
    at: new Date().toISOString(),
    night,
    documents: files.length,
    readable,
    unreadable: files.length - readable,
    facts,
    unplacedValues: unplaced,
  };
  writeFileSync(`${EXTRACTIONS_DIR}/_summary.json`, JSON.stringify(summary, null, 2));
  return { at: summary.at };
}
