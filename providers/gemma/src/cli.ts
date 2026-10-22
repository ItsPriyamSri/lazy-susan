import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { draftEssay } from "./essayist.js";
import { mapForm } from "./mapper.js";
import { generate } from "./ollama.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(HERE, "../../../packages/corpus");

/**
 * Warms the cache with one real run of the local model.
 *
 * Everything the app does afterwards reads these files, so a judge on a laptop
 * with no model installed still sees the same answers.
 */
async function main(): Promise<void> {
  const forms = ["bank-account", "enrolment", "scholarship"];

  for (const id of forms) {
    const spec = JSON.parse(readFileSync(join(CORPUS, "forms", `${id}.json`), "utf8")) as {
      title: string;
      fields: { id: string; label: string }[];
    };
    const mapping = await mapForm(spec.fields);
    console.log(
      `form ${id.padEnd(12)} ${mapping.stats.modelExact} exact, ${mapping.stats.modelRepaired} repaired, ` +
        `${mapping.stats.rules} by rules, ${mapping.stats.unmatched} unmatched  (${(mapping.ms / 1000).toFixed(1)}s)`,
    );
    for (const [fieldId, m] of Object.entries(mapping.byField)) {
      if (m.source !== "model") console.log(`   ${fieldId.padEnd(18)} ${m.source.padEnd(15)} ${m.key ?? "—"}  raw="${m.raw ?? ""}"`);
    }
  }

  const draft = await draftEssay(
    "In your own words: why are you a good fit for this scholarship?",
    [
      { key: "education.programme", value: "B.Tech Computer Engineering" },
      { key: "education.institution", value: "Testland Institute of Technology" },
      { key: "education.year", value: "3" },
      { key: "education.gpa", value: "8.6" },
      { key: "employment.role", value: "Software Engineering Intern" },
      { key: "employment.employer", value: "Testland Systems Private Limited" },
    ],
    200,
  );
  console.log(`\nessay (${(draft.ms / 1000).toFixed(1)}s):\n${draft.text}`);

  // One warm-up so the first reading of the day is not the slowest.
  await generate("Reply with the single word: ready", { numPredict: 8 });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
