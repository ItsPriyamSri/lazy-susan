import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const CACHE_DIR = join(HERE, "..", "cache");

export interface Cached {
  model: string;
  prompt: string;
  response: string;
  ms: number;
  at: string;
}

export interface GenerateOptions {
  model?: string;
  numPredict?: number;
  /** When false, a cache miss throws instead of calling the model. */
  allowModel?: boolean;
}

const DEFAULT_MODEL = process.env.LAZY_SUSAN_MODEL ?? "gemma3:1b";
const ENDPOINT = process.env.OLLAMA_URL ?? "http://localhost:11434";

/**
 * A local model call with a cache.
 *
 * The cache is the point: the run a judge opens in a browser has to be the same
 * run that happened on the laptop. Same prompt, same model, same answer.
 */
export async function generate(prompt: string, opts: GenerateOptions = {}): Promise<Cached> {
  const model = opts.model ?? DEFAULT_MODEL;
  const key = createHash("sha256").update(`${model}\u0000${prompt}`).digest("hex").slice(0, 24);
  const file = join(CACHE_DIR, `${key}.json`);

  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as Cached;

  if (opts.allowModel === false) {
    throw new Error(`no cached answer for prompt ${key}; run \`pnpm --filter @lazy-susan/gemma warm\` with the model running`);
  }

  const started = Date.now();
  const res = await fetch(`${ENDPOINT}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: { temperature: 0, num_predict: opts.numPredict ?? 320, num_ctx: 2048 },
    }),
    signal: AbortSignal.timeout(240_000),
  });

  if (!res.ok) throw new Error(`ollama ${res.status}: ${await res.text()}`);

  const body = (await res.json()) as { response?: string };
  const cached: Cached = {
    model,
    prompt,
    response: body.response ?? "",
    ms: Date.now() - started,
    at: new Date().toISOString(),
  };

  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify(cached, null, 2));
  return cached;
}

/** Pulls the first JSON object or array out of a reply, fences and all. */
export function extractJson<T>(text: string): T | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = fenced ? fenced[1]! : text;
  const start = body.search(/[[{]/);
  if (start < 0) return null;
  const open = body[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  for (let i = start; i < body.length; i++) {
    if (body[i] === open) depth++;
    else if (body[i] === close) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(body.slice(start, i + 1)) as T;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}
