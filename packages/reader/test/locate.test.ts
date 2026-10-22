import { describe, expect, it } from "vitest";
import { groupIntoLines, locate, tokenise } from "../src/index.js";
import type { Page, Word } from "../src/index.js";

const word = (text: string, x0: number, y0: number, x1: number, y1: number): Word => ({
  text,
  x0,
  y0,
  x1,
  y1,
});

/**
 * A page shaped like the ones `pdftotext -bbox-layout` gives back: the label on
 * one line, the value on the next, because the generator draws them in separate
 * blocks.
 */
function pageOf(...lines: Word[][]): Page {
  const grouped = groupIntoLines(lines.flat());
  return {
    index: 1,
    width: 595,
    height: 842,
    lines: grouped,
    text: grouped.map((l) => l.text).join("\n"),
  };
}

describe("tokenise", () => {
  it("ignores punctuation and case, so a printed value still matches", () => {
    expect(tokenise("14 Mar 2003")).toEqual(["14", "mar", "2003"]);
    expect(tokenise("priyam@example.com")).toEqual(["priyam@example.com"]);
    expect(tokenise("B.Tech (Computer Engineering)")).toEqual(["b.tech", "computer", "engineering"]);
  });
});

describe("locate", () => {
  const pages = [
    pageOf(
      [word("Full", 60, 100, 85, 112), word("name", 90, 100, 120, 112)],
      [word("PRIYAM", 60, 118, 105, 130), word("SHARMA", 110, 118, 160, 130)],
      [word("Date", 60, 150, 85, 162), word("of", 90, 150, 100, 162), word("birth", 105, 150, 130, 162)],
      [word("14", 60, 168, 72, 180), word("MAR", 76, 168, 95, 180), word("2003", 100, 168, 125, 180)],
    ),
  ];

  it("returns the rectangle the value actually occupies", () => {
    const found = locate(pages, "PRIYAM SHARMA");
    expect(found).not.toBeNull();
    expect(found!.page).toBe(1);
    expect(found!.words).toBe("PRIYAM SHARMA");
    // Two words on the same baseline: the box starts at the first and ends at the second.
    expect(found!.bbox.x).toBeCloseTo(60 / 595, 3);
    expect(found!.bbox.w).toBeCloseTo(100 / 595, 3);
    expect(found!.bbox.y).toBeCloseTo(118 / 842, 3);
  });

  it("finds a value that spans two lines of the same block", () => {
    const found = locate(pages, "14 MAR 2003");
    expect(found!.words).toBe("14 MAR 2003");
    expect(found!.bbox.h).toBeCloseTo(12 / 842, 3);
  });

  it("returns null instead of a plausible guess when the value is not there", () => {
    // The real failure this guard exists for: a model that spells the name wrong.
    expect(locate(pages, "PRAYAM SHARMA")).toBeNull();
  });

  it("keeps every coordinate inside the page", () => {
    const found = locate(pages, "SHARMA")!;
    for (const n of [found.bbox.x, found.bbox.y, found.bbox.w, found.bbox.h]) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
  });
});

describe("groupIntoLines", () => {
  it("puts words on one baseline together and keeps other baselines apart", () => {
    const lines = groupIntoLines([
      word("b", 100, 50, 120, 60),
      word("a", 60, 50, 80, 60),
      word("c", 60, 90, 80, 100),
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.text).toBe("a b");
    expect(lines[1]!.text).toBe("c");
  });

  it("keeps a slightly crooked scan on one line", () => {
    const lines = groupIntoLines([word("Full", 60, 100, 85, 112), word("name", 90, 102, 120, 114)]);
    expect(lines).toHaveLength(1);
  });
});
