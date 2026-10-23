import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readContext, writeContext } from "../src/context.js";
import { labelsFor } from "../src/portal.js";
import type { FormSpec } from "@lazy-susan/core";

const scratch = (): string => join(mkdtempSync(join(tmpdir(), "ls-context-")), "context.md");

describe("the paragraph about you", () => {
  it("says it found nothing before anything is written", () => {
    expect(readContext(scratch())).toEqual({ text: "", found: false });
  });

  it("saves exactly what was typed, then reads it back", () => {
    const path = scratch();
    const text = "I like tests more than demos.\nI would rather ship something honest.";
    const written = writeContext(`  ${text}  `, path);

    expect(written.found).toBe(true);
    expect(written.text).toBe(`${text}\n`);
    expect(readContext(path).text).toBe(`${text}\n`);
    expect(written.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("an empty save is an empty file, not a stale paragraph", () => {
    const path = scratch();
    writeContext("something", path);
    writeContext("   ", path);
    expect(readContext(path).text).toBe("");
  });
});

describe("matching a form's own wording to a key", () => {
  it("maps the question a textarea asks, which no name attribute would", () => {
    const spec: FormSpec = {
      id: "job",
      title: "Job application",
      kind: "html",
      file: "job.html",
      submissionDate: "2026-10-22",
      kicker: "Careers",
      fields: [
        { id: "a1", label: "Full name", key: "person.full_name", type: "text", required: true },
        { id: "a11", label: "Why should we hire you?", key: "essay.job", type: "textarea", required: true },
      ],
    };

    const byLabel = labelsFor(spec);
    expect(byLabel["full name"]).toBe("person.full_name");
    expect(byLabel["why should we hire you"]).toBe("essay.job");
  });
});
