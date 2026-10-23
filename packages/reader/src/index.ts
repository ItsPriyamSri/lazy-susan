import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { extractDocument } from "./extract.js";
import { readPdf } from "./pdf.js";
import { SUPPORTED_EXTENSIONS, readDocument } from "./text.js";

export * from "./pdf.js";
export * from "./text.js";
export * from "./locate.js";
export * from "./extract.js";

/** Reads every supported file in a folder. Order is by file name, so runs are reproducible. */
export function readFolder(dir: string): ReturnType<typeof extractDocument>[] {
  return readdirSync(dir)
    .filter((f) => SUPPORTED_EXTENSIONS.some((ext) => f.toLowerCase().endsWith(ext)))
    .sort()
    .map((file) => readOne(dir, file));
}

/** Reads one file. The digest is of the bytes, so it identifies the document itself. */
export function readOne(dir: string, file: string): ReturnType<typeof extractDocument> {
  const path = join(dir, file);
  const digest = `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
  return extractDocument(file, readDocument(path, readPdf), digest);
}
