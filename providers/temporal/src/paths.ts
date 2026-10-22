import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The folder the workflow reads. */
export const DOCS_DIR = resolve(HERE, "../../../packages/corpus/docs");
/** Where the reader parks one JSON file per document. */
export const EXTRACTIONS_DIR = resolve(HERE, "../../../packages/corpus/extractions");
/** One line per document actually read, across every night. */
export const LEDGER = resolve(HERE, "../../../apps/brain/out/night-ledger.jsonl");

export const TASK_QUEUE = "night";

export function extractionPath(file: string): string {
  return join(EXTRACTIONS_DIR, `${file.replace(/\.pdf$/i, "")}.json`);
}
