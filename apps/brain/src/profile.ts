import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isKnownKey } from "@lazy-susan/core";
import type { Fact } from "@lazy-susan/core";
import { OUT } from "./state.js";

/**
 * The part of you that is not in a document.
 *
 * A phone number, an email, a referee you always use. Typing them into every
 * form is the small tax that makes people give up, so they live in one file and
 * are read once. They are attested facts, not document facts: amber, weaker,
 * and the interface still says so.
 *
 * The file is a flat map of key to value. Keys this project does not know are
 * ignored with a warning rather than smuggled into a form.
 */

/** Resolved lazily: `OUT` lives in a module that imports this one. */
export function profileFile(): string {
  return process.env.PROFILE_PATH ?? join(OUT, "profile.json");
}

export interface ProfileLoad {
  facts: Fact[];
  ignored: string[];
  found: boolean;
}

export function loadProfile(path = profileFile(), at = new Date().toISOString()): ProfileLoad {
  if (!existsSync(path)) return { facts: [], ignored: [], found: false };

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`${path} is not valid JSON: ${(err as Error).message}`);
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`${path} should be an object of key: value pairs`);
  }

  const facts: Fact[] = [];
  const ignored: string[] = [];

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== "string" || !value.trim()) {
      ignored.push(key);
      continue;
    }
    if (!isKnownKey(key)) {
      ignored.push(key);
      continue;
    }
    facts.push({
      key,
      value: value.trim(),
      source: { kind: "attested", at, formId: "profile", by: "human" },
    });
  }

  return { facts, ignored, found: true };
}
