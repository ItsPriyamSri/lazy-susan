/**
 * The morning list, read out loud.
 *
 * Text to speech is a small thing that changes who can use the app: a list of
 * four reasons your form is not finished is easier to take in while you are
 * making coffee than on a screen.
 *
 * Without a key the browser reads the same script with its own voice. That is
 * the fallback, not a demo: the words are the app's either way.
 */

const ENDPOINT = "https://api.elevenlabs.io/v1/text-to-speech";

export interface SpeechRequest {
  text: string;
  voiceId?: string;
  modelId?: string;
  /** Base URL override, used by the tests. */
  endpoint?: string;
}

export interface SpeechResult {
  audio: Buffer;
  contentType: string;
  voiceId: string;
  modelId: string;
  ms: number;
}

export class NoVoiceKey extends Error {
  constructor() {
    super("ELEVENLABS_API_KEY is not set; the browser will read it instead");
    this.name = "NoVoiceKey";
  }
}

export function isConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

export const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM";
export const DEFAULT_MODEL = "eleven_multilingual_v2";

export async function speak(request: SpeechRequest): Promise<SpeechResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new NoVoiceKey();

  const voiceId = request.voiceId ?? process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE;
  const modelId = request.modelId ?? process.env.ELEVENLABS_MODEL_ID ?? DEFAULT_MODEL;
  const started = Date.now();

  const response = await fetch(`${request.endpoint ?? ENDPOINT}/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "content-type": "application/json",
      accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: request.text,
      model_id: modelId,
      voice_settings: { stability: 0.4, similarity_boost: 0.75 },
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`elevenlabs ${response.status}: ${detail.slice(0, 200)}`);
  }

  return {
    audio: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") ?? "audio/mpeg",
    voiceId,
    modelId,
    ms: Date.now() - started,
  };
}

/**
 * Turns a form's open fields into something a person would say out loud.
 *
 * Deliberately short. Nobody wants a robot reading a table.
 */
export function briefScript(input: {
  formTitle: string;
  open: { label: string; reason: string }[];
}): string {
  const n = input.open.length;
  if (n === 0) return `${input.formTitle} is finished. Nothing needs you.`;

  const head =
    n === 1
      ? `One thing needs you on ${input.formTitle}.`
      : `${n} things need you on ${input.formTitle}.`;

  const body = input.open
    .map((f) => {
      const reason = f.reason.replace(/\s+/g, " ").trim();
      return `${f.label}. ${reason}`;
    })
    .join(" ");

  return `${head} ${body}`;
}
