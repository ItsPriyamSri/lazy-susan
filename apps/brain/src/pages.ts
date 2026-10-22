import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { CORPUS } from "./state.js";

const CACHE = join(CORPUS, "pages");

/**
 * Renders a page to a PNG so the interface can draw a box on it.
 *
 * The box is the whole argument of the project: here is the rectangle the value
 * came from. A picture of the page makes that checkable by eye.
 */
export function pagePng(file: string, page: number): string {
  mkdirSync(CACHE, { recursive: true });
  const safe = file.replace(/[^\w.-]/g, "_");
  const prefix = join(CACHE, `${safe.replace(/\.pdf$/i, "")}-p${page}`);
  const out = `${prefix}.png`;

  if (!existsSync(out)) {
    execFileSync("pdftoppm", ["-png", "-r", "120", "-f", String(page), "-l", String(page), "-singlefile", join(CORPUS, "docs", file), prefix]);
  }
  return out;
}
