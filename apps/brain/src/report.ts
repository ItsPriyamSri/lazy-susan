import { readFileSync } from "node:fs";
import { join } from "node:path";
import { planFill, runForm } from "@lazy-susan/core";
import type { Fact, RunResult } from "@lazy-susan/core";
import { essayFor, loadState, rulesWith } from "./state.js";
import { CORPUS } from "./state.js";

/**
 * Prints every number the write-up quotes, computed from the files in this
 * repository. If a sentence in the post has a number in it, this is where that
 * number came from.
 */

const ANSWERS: Record<string, string> = {
  "person.phone.mobile": "+91 98765 43210",
  "person.email": "priyam@example.com",
  "address.current.line1": "44 MG Road",
  "address.current.postcode": "411045",
  "referee.1.name": "Dr A. Kulkarni",
  "referee.1.phone": "+91 98200 11223",
};

const ORDER = ["bank-account", "enrolment", "scholarship"];

async function main(): Promise<void> {
  const state = loadState();
  const rules = rulesWith(undefined);
  const at = state.readAt;

  console.log("the folder");
  console.log(`  files                ${state.docs.length}`);
  console.log(`  readable             ${state.docs.filter((d) => d.readable).length}`);
  console.log(`  no text layer        ${state.docs.filter((d) => !d.readable).length}`);
  console.log(`  facts indexed        ${state.counters.facts}`);
  console.log(`  values proposed but not found on a page  ${state.counters.unplaced}`);

  console.log("\nthe model");
  try {
    const replay = JSON.parse(readFileSync(join(CORPUS, "..", "..", "apps/web/src/data/replay.json"), "utf8")) as {
      forms: { spec: { id: string }; mapping: { stats: Record<string, number>; model: string } }[];
    };
    let exact = 0;
    let repaired = 0;
    let byRules = 0;
    let unmatched = 0;
    let fields = 0;
    for (const f of replay.forms) {
      exact += f.mapping.stats.modelExact ?? 0;
      repaired += f.mapping.stats.modelRepaired ?? 0;
      byRules += f.mapping.stats.rules ?? 0;
      unmatched += f.mapping.stats.unmatched ?? 0;
      fields += f.mapping.stats.fields ?? 0;
      console.log(
        `  ${f.spec.id.padEnd(12)} ${String(f.mapping.stats.modelExact).padStart(2)} exact, ` +
          `${f.mapping.stats.modelRepaired} repaired, ${f.mapping.stats.rules} by rules, ${f.mapping.stats.unmatched} unmatched`,
      );
    }
    console.log(`  model                 ${replay.forms[0]?.mapping.model ?? "gemma3:1b"}`);
    console.log(`  labels                ${fields}`);
    console.log(`  model got it exactly  ${exact}`);
    console.log(`  repaired by code      ${repaired}`);
    console.log(`  label rules           ${byRules}`);
    console.log(`  left unmapped         ${unmatched}`);
  } catch {
    console.log("  (no replay.json yet; run `pnpm export`)");
  }

  console.log("\nthe three forms, in order, carrying answers forward");
  let index = state.journal.rebuild();
  let totalQuestions = 0;

  for (const id of ORDER) {
    const form = state.forms.find((f) => f.id === id)!;
    const run: RunResult = runForm(form, index, rules, at);
    const open = run.fields.filter((f) => f.verdict !== "FILLED");
    console.log(
      `  ${id.padEnd(12)} ${String(run.fields.length).padStart(2)} fields · filled ${run.counts.FILLED} · ` +
        `questions ${open.length}${open.length ? ` (${open.map((f) => f.field.label).join(", ")})` : ""}`,
    );
    totalQuestions += open.length;

    for (const f of open) {
      const value = ANSWERS[f.field.key];
      if (!value) continue;
      const fact: Fact = {
        key: f.field.key,
        value,
        source: {
          kind: "attested",
          at,
          formId: id,
          by: "human",
          ...(f.verdict === "CONFLICT" ? { resolvedAgainst: "statement-jul-2026.pdf" } : {}),
        },
      };
      index.attest(fact);
    }
  }
  console.log(`  ${"total".padEnd(12)} ${totalQuestions} questions across ${ORDER.length} forms`);

  console.log("\nthe paragraph");
  const spec = state.forms.find((f) => f.id === "scholarship")!;
  const question = spec.fields.find((f) => f.type === "textarea")!.label;
  const essay = await essayFor(state, "scholarship", question, false);
  console.log(`  drafted by            ${essay.source}`);
  console.log(`  sentences kept        ${essay.draft.accepted.length}`);
  console.log(`  sentences struck      ${essay.draft.struck.length}`);
  for (const s of essay.draft.struck) console.log(`     "${s.text.slice(0, 70)}…" — ${s.reason}`);

  console.log("\nthe fill");
  for (const id of ORDER) {
    const form = state.forms.find((f) => f.id === id)!;
    const run = runForm(form, state.index, rules, at);
    const plan = planFill(run);
    console.log(
      `  ${id.padEnd(12)} ${plan.patches.length} values, ${plan.attachments.length} attachments, ${plan.blocked.length} blocks`,
    );
  }

  console.log("\nthe ledger");
  console.log(`  entries               ${state.journal.entries.length}`);
  console.log(`  chain verified        ${state.journal.verify().ok}`);
  console.log(`  head                  ${state.journal.head().slice(0, 16)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
