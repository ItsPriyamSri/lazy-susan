import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { extractDocument } from "./extract.js";
import { readPdf } from "./pdf.js";

export * from "./pdf.js";
export * from "./locate.js";
export * from "./extract.js";

/** Reads every PDF in a folder. Order is by file name, so runs are reproducible. */
export function readFolder(dir: string): ReturnType<typeof extractDocument>[] {
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .sort()
    .map((file) => readOne(dir, file));
}

/** Reads one PDF. The digest is of the bytes, so it identifies the document itself. */
export function readOne(dir: string, file: string): ReturnType<typeof extractDocument> {
  const path = join(dir, file);
  const digest = `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
  return extractDocument(file, readPdf(path), digest);
}
