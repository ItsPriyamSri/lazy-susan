import type { BBox } from "@lazy-susan/core";
import type { Page, Word } from "./pdf.js";

export interface Located {
  page: number;
  bbox: BBox;
  /** The words that were matched, for the "show me" panel. */
  words: string;
  /** Zero-based index of the line the first matched word sits on. */
  line: number;
  /** The whole line, for a file where a line is the only pointer there is. */
  excerpt: string;
}

/** Lowercase, letters and digits only, so punctuation never defeats a match. */
export function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[,;:()[\]"']/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9@.+\-/&]/g, ""))
    .filter(Boolean);
}

/**
 * Finds a value in a page and returns the rectangle it occupies.
 *
 * This is the function that makes the whole promise true. If it returns null,
 * nobody can point at where the value came from, so it does not get filled.
 */
export function locate(pages: Page[], value: string): Located | null {
  const needle = tokenise(value);
  if (!needle.length) return null;

  for (const page of pages) {
    const flat: { token: string; word: Word; line: number }[] = [];
    page.lines.forEach((line, lineIndex) => {
      for (const word of line.words) {
        const token = tokenise(word.text)[0];
        if (token) flat.push({ token, word, line: lineIndex });
      }
    });

    for (let i = 0; i + needle.length <= flat.length; i++) {
      let ok = true;
      for (let j = 0; j < needle.length; j++) {
        if (flat[i + j]!.token !== needle[j]) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      const matched = flat.slice(i, i + needle.length).map((f) => f.word);
      const x0 = Math.min(...matched.map((w) => w.x0));
      const y0 = Math.min(...matched.map((w) => w.y0));
      const x1 = Math.max(...matched.map((w) => w.x1));
      const y1 = Math.max(...matched.map((w) => w.y1));

      return {
        page: page.index,
        bbox: {
          x: clamp(x0 / page.width),
          y: clamp(y0 / page.height),
          w: clamp((x1 - x0) / page.width),
          h: clamp((y1 - y0) / page.height),
        },
        words: matched.map((w) => w.text).join(" "),
        line: flat[i]!.line,
        excerpt: page.lines[flat[i]!.line]?.text ?? "",
      };
    }
  }

  return null;
}

function clamp(n: number): number {
  return Math.min(1, Math.max(0, Number(n.toFixed(4))));
}
