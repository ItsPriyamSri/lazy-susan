import { log, proxyActivities } from "@temporalio/workflow";
import type * as activities from "./activities.js";

const { readDocument, finishNight } = proxyActivities<typeof activities>({
  startToCloseTimeout: "3 minutes",
  retry: {
    initialInterval: "1s",
    backoffCoefficient: 1,
    maximumAttempts: 5,
  },
});

export interface NightInput {
  night: string;
  /** File names, in the order they are read. */
  files: string[];
}

export interface NightResult {
  night: string;
  files: number;
  facts: number;
  /** How many rows the ledger actually gained. Zero on a fully resumed run. */
  written: number;
}

/**
 * The night: read every document in the folder, one at a time.
 *
 * Temporal keeps the position. If the worker dies halfway through, the next
 * worker replays this function from the event history, does not re-run the
 * activities that already completed, and finishes the ones that did not.
 */
export async function nightRun(input: NightInput): Promise<NightResult> {
  let facts = 0;
  let written = 0;

  for (const file of input.files) {
    const result = await readDocument({ file, night: input.night });
    facts += result.facts;
    if (result.written) written += 1;
    log.info("read a document", { file: result.file, facts: result.facts, firstTime: result.written });
  }

  await finishNight(input.night);
  return { night: input.night, files: input.files.length, facts, written };
}
