import { mkdirSync, copyFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mapForm } from "@lazy-susan/gemma";
import { pagePng } from "./pages.js";
import { essayFor, loadState } from "./state.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_DATA = join(HERE, "../../web/src/data");
const WEB_PAGES = join(HERE, "../../web/public/pages");

/**
 * Freezes one run into a file the browser can replay.
 *
 * The rules, the verdicts and the essay check all run again in the browser from
 * the same facts, so moving the tolerance slider is not watching a recording.
 * Only the model's own words are frozen, because a laptop is not a server.
 */
async function main(): Promise<void> {
  const state = loadState();
  const forms = [];

  for (const spec of state.forms) {
    const mapping = await mapForm(spec.fields);
    forms.push({
      spec,
      mapping: {
        byField: mapping.byField,
        stats: mapping.stats,
        model: mapping.model,
      },
    });
    console.log(
      `mapped ${spec.id.padEnd(12)} ${mapping.stats.modelExact} exact, ${mapping.stats.modelRepaired} repaired, ` +
        `${mapping.stats.rules} rules, ${mapping.stats.unmatched} unmatched`,
    );
  }

  const essay = await essayFor(
    state,
    "scholarship",
    state.forms.find((f) => f.id === "scholarship")?.fields.find((f) => f.type === "textarea")?.label ??
      "Why are you a good fit?",
    true,
  );

  const payload = {
    generatedAt: new Date().toISOString(),
    readAt: state.readAt,
    counters: state.counters,
    documents: state.docs,
    index: state.index.toJSON(),
    forms,
    essays: {
      scholarship: { draft: essay.draft, source: essay.source, question: essay.question },
    },
    journal: { entries: state.journal.entries.length, head: state.journal.head(), verified: state.journal.verify() },
  };

  mkdirSync(WEB_DATA, { recursive: true });
  mkdirSync(WEB_PAGES, { recursive: true });

  for (const doc of state.docs) {
    if (!doc.readable) continue;
    for (let p = 1; p <= doc.pages; p++) {
      const src = pagePng(doc.file, p);
      copyFileSync(src, join(WEB_PAGES, `${doc.file.replace(/\.pdf$/i, "")}-p${p}.png`));
    }
  }

  writeFileSync(join(WEB_DATA, "replay.json"), JSON.stringify(payload));
  console.log(`wrote ${join(WEB_DATA, "replay.json")} and ${state.docs.filter((d) => d.readable).length} page images`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
