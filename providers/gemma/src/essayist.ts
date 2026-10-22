import { generate } from "./ollama.js";

export interface Draft {
  text: string;
  model: string;
  ms: number;
}

/**
 * Asks the local model for a paragraph, and nothing else.
 *
 * The model is not asked to cite anything, because it is bad at that and the
 * code does it better: every sentence that comes back is matched against the
 * facts afterwards (see `attributeFacts` in core).
 */
export async function draftEssay(
  question: string,
  facts: { key: string; value: string }[],
  maxWords: number,
  allowModel = true,
): Promise<Draft> {
  const prompt = [
    "Write a short first-person answer. Plain English, no headings, no lists.",
    `At most ${maxWords} words. Do not invent numbers, dates, employers or awards.`,
    "Facts you may use:",
    ...facts.map((f) => `- ${f.value}`),
    "",
    `Question: ${question}`,
  ].join("\n");

  const reply = await generate(prompt, { allowModel, numPredict: 260 });
  return { text: reply.response.trim().replace(/^["']|["']$/g, ""), model: reply.model, ms: reply.ms };
}
