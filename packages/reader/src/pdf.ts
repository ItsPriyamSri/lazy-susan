import { execFileSync } from "node:child_process";

/** A word as the PDF itself places it, in points from the top-left of the page. */
export interface Word {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Line {
  text: string;
  words: Word[];
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Page {
  index: number;
  width: number;
  height: number;
  lines: Line[];
  text: string;
}

export interface RawDoc {
  file: string;
  pages: Page[];
  /** True when the file has no text at all, i.e. it is a picture of a page. */
  imageOnly: boolean;
  /**
   * `pdf` has real page geometry. `text` is a .txt or a .docx laid out into
   * lines: the line number is the pointer, not the rectangle.
   */
  format: "pdf" | "text";
}

const ENTITY: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
};

function unescape(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|apos|#39);/g, (m) => ENTITY[m] ?? m);
}

/**
 * Reads a PDF's own text layer together with the position of every word.
 *
 * No model is involved here, on purpose. A value that cannot be found in this
 * output cannot be filled, because there is nothing to point at.
 */
export function readPdf(path: string): RawDoc {
  const xml = execFileSync("pdftotext", ["-bbox-layout", path, "-"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  const pages: Page[] = [];
  const pageRe = /<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g;
  let pm: RegExpExecArray | null;
  let pageIndex = 0;

  while ((pm = pageRe.exec(xml))) {
    const width = Number(pm[1]);
    const height = Number(pm[2]);
    const body = pm[3] ?? "";

    // pdftotext groups a wide gap into two blocks, which splits "Full name:"
    // from the value beside it. Rebuild the lines by their baseline instead.
    const words: Word[] = [];
    const wordRe = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/word>/g;
    let wm: RegExpExecArray | null;
    while ((wm = wordRe.exec(body))) {
      words.push({
        text: unescape(wm[5] ?? ""),
        x0: Number(wm[1]),
        y0: Number(wm[2]),
        x1: Number(wm[3]),
        y1: Number(wm[4]),
      });
    }

    const lines = groupIntoLines(words);

    pages.push({
      index: pageIndex,
      width,
      height,
      lines,
      text: lines.map((l) => l.text).join("\n"),
    });
    pageIndex++;
  }

  return {
    file: path,
    pages,
    imageOnly: pages.every((p) => p.lines.length === 0),
    format: "pdf",
  };
}

/** Groups words that share a baseline into one line, left to right. */
export function groupIntoLines(words: Word[]): Line[] {
  const sorted = [...words].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const groups: Word[][] = [];

  for (const w of sorted) {
    const bucket = groups.find((g) => Math.abs(g[0]!.y0 - w.y0) <= 3.5);
    if (bucket) bucket.push(w);
    else groups.push([w]);
  }

  return groups
    .map((g) => {
      const ordered = [...g].sort((a, b) => a.x0 - b.x0);
      return {
        text: ordered.map((w) => w.text).join(" ").replace(/\s+/g, " ").trim(),
        words: ordered,
        x0: Math.min(...ordered.map((w) => w.x0)),
        y0: Math.min(...ordered.map((w) => w.y0)),
        x1: Math.max(...ordered.map((w) => w.x1)),
        y1: Math.max(...ordered.map((w) => w.y1)),
      };
    })
    .filter((l) => l.text.length > 0)
    .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
}
