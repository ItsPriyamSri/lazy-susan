import { readFileSync } from "node:fs";
import { unzipSync } from "fflate";
import type { Line, Page, RawDoc, Word } from "./pdf.js";

/**
 * Files that are not PDFs.
 *
 * A resume arrives as a .docx and a set of notes arrives as a .txt. Neither
 * has pages or rectangles, so the pointer is a line instead: the 1-based line
 * number and the words on it. The rest of the pipeline does not care — a value
 * still has to be found in the text before it is allowed into the index.
 *
 * The geometry below is a layout for those lines, not a claim about a page. It
 * exists so the same `locate` function can answer "where is this value" for
 * every format; the interface shows the line, not a fake page.
 */

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const LEFT = 48;
const TOP = 48;
const LINE_HEIGHT = 16;
const CHAR_WIDTH = 7.2;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decode(s: string): string {
  return s
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)));
}

/** Lays lines of text out as words with positions, so `locate` can run on them. */
export function layoutText(file: string, lines: string[]): RawDoc {
  const kept = lines.map((l) => l.replace(/\s+/g, " ").trim());
  const height = Math.max(PAGE_HEIGHT, TOP + kept.length * LINE_HEIGHT + 48);

  const pageLines: Line[] = kept.map((text, i) => {
    const y = TOP + i * LINE_HEIGHT;
    let x = LEFT;
    const words: Word[] = text
      .split(" ")
      .filter(Boolean)
      .map((word) => {
        const w: Word = {
          text: word,
          x0: x,
          y0: y,
          x1: x + word.length * CHAR_WIDTH,
          y1: y + 11,
        };
        x += word.length * CHAR_WIDTH + CHAR_WIDTH;
        return w;
      });

    return {
      text,
      words,
      x0: LEFT,
      y0: y,
      x1: Math.max(LEFT + 1, x),
      y1: y + 11,
    };
  });

  const page: Page = {
    index: 0,
    width: PAGE_WIDTH,
    height,
    lines: pageLines,
    text: kept.join("\n"),
  };

  return {
    file,
    pages: [page],
    imageOnly: pageLines.length === 0,
    format: "text",
  };
}

export function readText(path: string): RawDoc {
  return layoutText(path, readFileSync(path, "utf8").split(/\r?\n/));
}

/**
 * A .docx is a zip with one XML file that matters.
 *
 * Every paragraph is a `<w:p>`, every run of text inside it is a `<w:t>`. That
 * is enough for a resume: headings, bullets and table cells all end up as
 * paragraphs, and a paragraph is a line.
 */
export function readDocx(path: string): RawDoc {
  const zip = unzipSync(new Uint8Array(readFileSync(path)));
  const xmlBytes = zip["word/document.xml"];
  if (!xmlBytes) throw new Error(`${path} has no word/document.xml; is it really a .docx?`);

  const xml = new TextDecoder("utf-8").decode(xmlBytes);
  const paragraphs: string[] = [];

  for (const chunk of xml.split(/<\/w:p>/)) {
    const parts: string[] = [];
    const run = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g;
    let m: RegExpExecArray | null;
    while ((m = run.exec(chunk))) {
      if (m[1] !== undefined) parts.push(decode(m[1]));
      else if (m[0].startsWith("<w:tab")) parts.push("\t");
      else parts.push(" ");
    }
    const text = parts.join("").replace(/\s+/g, " ").trim();
    if (text) paragraphs.push(text);
  }

  return layoutText(path, paragraphs);
}

const BY_EXTENSION: [RegExp, (path: string) => RawDoc][] = [
  [/\.docx$/i, readDocx],
  [/\.(txt|md|markdown|text)$/i, readText],
];

export const SUPPORTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".md"];

/** Reads any supported file. The caller never has to know which one it got. */
export function readDocument(path: string, pdf: (path: string) => RawDoc): RawDoc {
  for (const [re, read] of BY_EXTENSION) if (re.test(path)) return read(path);
  return pdf(path);
}
