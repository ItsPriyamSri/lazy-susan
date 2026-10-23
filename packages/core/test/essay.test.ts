import { describe, expect, it } from "vitest";
import { Index, KEY, annotateEssay, attributeFacts, needsYou } from "../src/index.js";
import type { Fact } from "../src/index.js";

const attested = (key: string, value: string): Fact => ({
  key,
  value,
  source: { kind: "attested", at: "2026-10-23T00:00:00.000Z", formId: "context", by: "human" },
});

describe("questions that are not in the folder", () => {
  it("knows which ones are about the company", () => {
    expect(needsYou("Why do you want to work at this company?")).toBe(true);
    expect(needsYou("What do you know about us?")).toBe(true);
    expect(needsYou("Why our company?")).toBe(true);
    expect(needsYou("Why did you choose to join us?")).toBe(true);
  });

  it("leaves questions about the person alone", () => {
    expect(needsYou("Why should we hire you?")).toBe(false);
    expect(needsYou("Tell us about your final-year project.")).toBe(false);
    expect(needsYou("Why are you a good fit?")).toBe(false);
  });
});

describe("refusing an essay with nothing behind it", () => {
  it("says the box is the person's when no fact is used", () => {
    const index = new Index();
    index.addFact(attested(KEY.personName, "PRIYAM SHARMA"));

    const view = annotateEssay(
      "Why do you want to work at this company?",
      attributeFacts("I admire the company and would love to join the team.", []),
      index,
      100,
    );

    expect(view.refusedKind).toBe("no-facts");
    expect(view.refused).toMatch(/yours/i);
  });

  it("calls it thin when one or two facts are used but not enough for a paragraph", () => {
    const index = new Index();
    index.addFact(attested(KEY.personName, "PRIYAM SHARMA"));

    const view = annotateEssay(
      "Why should we hire you?",
      attributeFacts("My name is Priyam Sharma.", [attested(KEY.personName, "PRIYAM SHARMA")]),
      index,
      100,
    );

    expect(view.refusedKind).toBe("thin");
    expect(view.refused).toMatch(/1 fact/);
  });
});

describe("a paragraph written from the notes", () => {
  it("is accepted when three or more facts are behind it", () => {
    const index = new Index();
    const facts = [
      attested(KEY.context, "I like tests more than demos."),
      attested(KEY.skills, "Python, TypeScript"),
      attested(KEY.educationGpa, "8.6"),
    ];
    for (const fact of facts) index.addFact(fact);

    const draft =
      "I like tests more than demos. I work with Python and TypeScript. My cumulative grade point average is 8.6.";
    const view = annotateEssay("Why should we hire you?", attributeFacts(draft, facts), index, 100);

    expect(view.refused).toBeUndefined();
    expect(view.refusedKind).toBeUndefined();
    expect(view.text).toContain("Python");
  });
});
