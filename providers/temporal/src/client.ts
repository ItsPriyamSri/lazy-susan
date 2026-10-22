import { Client, Connection } from "@temporalio/client";
import { readdirSync } from "node:fs";
import { DOCS_DIR, LEDGER, TASK_QUEUE } from "./paths.js";
import { readLedger } from "./ledger.js";
import type { NightInput, NightResult } from "./workflows.js";

/**
 * Starts one night and waits for it, printing the ledger as it grows.
 *
 * Run it twice with the same id and the second call attaches to the first
 * workflow instead of starting a new one, which is how a resumed run is
 * observed from the outside.
 */
async function main(): Promise<void> {
  const address = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
  const files = readdirSync(DOCS_DIR)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .sort();

  const night = process.argv[2] ?? `night-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;

  const connection = await Connection.connect({ address });
  const client = new Client({ connection });

  const handle = await client.workflow.start("nightRun", {
    workflowId: night,
    taskQueue: TASK_QUEUE,
    args: [{ night, files }],
    workflowIdConflictPolicy: "USE_EXISTING",
  });

  console.log(`workflow ${handle.workflowId} · run ${handle.firstExecutionRunId.slice(0, 8)} · ${files.length} files`);

  let lastRows = -1;
  const ticker = setInterval(() => {
    const rows = readLedger(LEDGER).length;
    if (rows !== lastRows) {
      lastRows = rows;
      console.log(`  ledger rows: ${rows}/${files.length}`);
    }
  }, 1000);

  const result = (await handle.result()) as NightResult;

  clearInterval(ticker);
  const rows = readLedger(LEDGER);
  console.log(
    `\n${result.night}: ${result.files} files, ${result.facts} facts, ` +
      `${result.written} ledger rows written this run, ${rows.length} rows total`,
  );
  console.log(`describe: temporal workflow describe --workflow-id ${handle.workflowId}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
