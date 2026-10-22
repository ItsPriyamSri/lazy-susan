import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_MODEL, NoVoiceKey, briefScript, isConfigured, speak } from "../src/index.js";

describe("the script", () => {
  it("says nothing needs doing when nothing does", () => {
    expect(briefScript({ formTitle: "the bank form", open: [] })).toBe(
      "the bank form is finished. Nothing needs you.",
    );
  });

  it("counts the fields instead of describing them", () => {
    const text = briefScript({
      formTitle: "the bank form",
      open: [
        { label: "Postcode", reason: "The only proof is five months old." },
        { label: "Mobile number", reason: "No document contains a phone number." },
      ],
    });
    expect(text).toContain("2 things need you");
    expect(text).toContain("Postcode.");
    expect(text).toContain("No document contains a phone number.");
  });

  it("uses the singular when there is one", () => {
    const text = briefScript({ formTitle: "the enrolment", open: [{ label: "Referee name", reason: "unreadable" }] });
    expect(text.startsWith("One thing needs you")).toBe(true);
  });

  it("does not read a table aloud, it reads sentences", () => {
    const text = briefScript({
      formTitle: "the scholarship",
      open: [{ label: "Referee mobile", reason: "a picture with no text layer" }],
    });
    expect(text).not.toContain("|");
    expect(text).not.toContain("\n");
  });
});

describe("speak", () => {
  const requests: { url?: string; headers: Record<string, unknown>; body: string }[] = [];
  let server: ReturnType<typeof createServer>;
  let base = "";

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        requests.push({ url: req.url, headers: req.headers as never, body });
        if (req.url?.includes("missing")) {
          res.writeHead(404, { "content-type": "application/json" });
          res.end(JSON.stringify({ detail: "voice not found" }));
          return;
        }
        res.writeHead(200, { "content-type": "audio/mpeg" });
        res.end(Buffer.from("ID3fake-mp3-bytes"));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  it("refuses politely when there is no key, so the browser can take over", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    expect(isConfigured()).toBe(false);
    await expect(speak({ text: "hello" })).rejects.toBeInstanceOf(NoVoiceKey);
  });

  it("posts the script to the configured voice with the key in the header", async () => {
    process.env.ELEVENLABS_API_KEY = "test-key";
    requests.length = 0;

    const result = await speak({ text: "Four things need you.", endpoint: base });

    expect(result.audio.toString()).toBe("ID3fake-mp3-bytes");
    expect(result.contentType).toBe("audio/mpeg");
    expect(result.modelId).toBe(DEFAULT_MODEL);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.headers["xi-api-key"]).toBe("test-key");
    expect(JSON.parse(requests[0]!.body).text).toBe("Four things need you.");
  });

  it("surfaces the provider's own error instead of a blank audio file", async () => {
    process.env.ELEVENLABS_API_KEY = "test-key";
    await expect(
      speak({ text: "anything", endpoint: `${base}/missing` }),
    ).rejects.toThrow(/elevenlabs 404/);
  });
});
