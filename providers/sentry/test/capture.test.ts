import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { initSentry, resetSentry, withSpan } from "../src/index.js";

/**
 * Proves the tracing is real without an account: the SDK is pointed at a DSN on
 * localhost, and the envelope it would have sent to Sentry is captured instead.
 */
describe("sentry tracing", () => {
  const bodies: string[] = [];
  let server: ReturnType<typeof createServer>;
  let port = 0;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        bodies.push(body);
        res.writeHead(200, { "content-type": "application/json" });
        res.end("{}");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await resetSentry();
    await new Promise<void>((r) => server.close(() => r()));
  });

  it("does nothing at all when no DSN is set", async () => {
    delete process.env.SENTRY_DSN;
    expect(initSentry()).toBe(false);
    await withSpan("read passport.pdf", "document", async () => 1);
    expect(bodies).toHaveLength(0);
  });

  it("sends a span with the work inside it when a DSN is set", async () => {
    process.env.SENTRY_DSN = `http://publickey@127.0.0.1:${port}/1`;
    expect(initSentry()).toBe(true);

    const value = await withSpan("read passport.pdf", "document", async () => 41);
    expect(value).toBe(41);

    const { getClient } = await import("@sentry/node");
    await getClient()?.flush(3000);

    const all = bodies.join("\n");
    expect(all.length).toBeGreaterThan(0);
    expect(all).toContain("read passport.pdf");
  });

  it("captures a thrown error instead of swallowing it", async () => {
    await expect(
      withSpan("read broken.pdf", "document", async () => {
        throw new Error("no text layer");
      }),
    ).rejects.toThrow("no text layer");
  });
});
