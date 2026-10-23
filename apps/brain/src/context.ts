import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { OUT } from "./state.js";

/**
 * The paragraph a person writes about themselves.
 *
 * It is not a document and it is not a fact table: it is their own words, kept
 * in one file, read at startup as an attested fact. It is what turns "why
 * should we hire you" from a question the app refuses into one it can draft,
 * and it is why the answer still reads like the person rather than a resume.
 */

/** Resolved lazily: `OUT` lives in a module that imports this one. */
export function contextFile(): string {
  return process.env.CONTEXT_PATH ?? join(OUT, "context.md");
}

export interface ContextRead {
  text: string;
  savedAt?: string;
  found: boolean;
}

export function readContext(path = contextFile()): ContextRead {
  if (!existsSync(path)) return { text: "", found: false };
  const text = readFileSync(path, "utf8");
  return { text, savedAt: statSync(path).mtime.toISOString(), found: true };
}

export function writeContext(text: string, path = contextFile()): ContextRead {
  mkdirSync(dirname(path), { recursive: true });
  const trimmed = text.trim();
  writeFileSync(path, trimmed ? `${trimmed}\n` : "", "utf8");
  return readContext(path);
}
