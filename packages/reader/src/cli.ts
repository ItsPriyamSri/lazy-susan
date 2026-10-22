import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFolder } from "./index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(HERE, "../../corpus");

export function main(): number {
  const docsDir = join(CORPUS, "docs");
  const outDir = join(CORPUS, "extractions");
  mkdirSync(outDir, { recursive: true });

  const extractions = readFolder(docsDir);
  let facts = 0;
  let unplaced = 0;
  let unreadable = 0;

  for (const e of extractions) {
    writeFileSync(join(outDir, `${e.file.replace(/\.pdf$/i, "")}.json`), JSON.stringify(e, null, 2));
    facts += e.facts.length;
    unplaced += e.stats.unplaced.length;
    if (!e.readable) unreadable++;
    const mark = e.readable ? " " : "!";
    console.log(
      `${mark} ${e.file.padEnd(28)} ${e.kind.padEnd(14)} ${String(e.facts.length).padStart(2)} facts  ${e.issued ?? "—"}`,
    );
  }

  const summary = {
    at: new Date().toISOString(),
    documents: extractions.length,
    readable: extractions.filter((e) => e.readable).length,
    unreadable,
    facts,
    unplacedValues: unplaced,
  };
  writeFileSync(join(outDir, "_summary.json"), JSON.stringify(summary, null, 2));
  console.log(`\n${summary.documents} documents, ${summary.readable} readable, ${summary.unreadable} not, ${facts} facts, ${unplaced} proposed values could not be found on the page.`);
  return 0;
}

main();
