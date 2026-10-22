import { NativeConnection, Worker } from "@temporalio/worker";
import { fileURLToPath } from "node:url";
import * as activities from "./activities.js";
import { TASK_QUEUE } from "./paths.js";

/**
 * The worker. Kill it at any point during a night and start it again; the
 * workflow is still where it was.
 */
async function main(): Promise<void> {
  const address = process.env.TEMPORAL_ADDRESS ?? "localhost:7233";
  const connection = await NativeConnection.connect({ address });

  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
    taskQueue: TASK_QUEUE,
    // The compiled workflow bundle: the sandbox cannot run TypeScript directly.
    workflowsPath: fileURLToPath(new URL("../dist/workflows.js", import.meta.url)),
    activities,
    // One document at a time. The pace is the point.
    maxConcurrentActivityTaskExecutions: 1,
  });

  console.log(`worker listening on ${address}, queue "${TASK_QUEUE}"`);
  await worker.run();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
