import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fillPortal, portalMode } from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FORMS = resolve(HERE, "../../../packages/corpus/forms");
const DOCS = resolve(HERE, "../../../packages/corpus/docs");

/**
 * These run in a local browser, which is the same code path a Browserbase
 * session takes: the only difference is which Chrome the CDP connection points
 * at. Skipped rather than faked when no browser is installed.
 */
const hasBrowser = ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].some(
  (p) => {
    try {
      return readFileSync(p) !== undefined;
    } catch {
      return false;
    }
  },
);

describe.skipIf(!hasBrowser)("filling a real page", () => {
  let server: ReturnType<typeof createServer>;
  let base = "";

  beforeAll(async () => {
    server = createServer((req, res) => {
      const name = (req.url ?? "/").split("?")[0]!.replace(/^\//, "");
      try {
        const body = readFileSync(join(FORMS, name));
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(body);
      } catch {
        res.writeHead(404).end("no");
      }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
  });

  it("is in local mode when no Browserbase key is set", () => {
    delete process.env.BROWSERBASE_API_KEY;
    expect(portalMode()).toBe("local");
  });

  it("types the values it was given and reads them back off the page", async () => {
    const result = await fillPortal({
      url: `${base}/enrolment.html`,
      fields: [
        { name: "full_name", value: "PRIYAM SHARMA" },
        { name: "programme", value: "B.Tech Computer Engineering" },
        { name: "dob", value: "2003-03-14" },
      ],
    });

    expect(result.mode).toBe("local");
    expect(result.filled).toEqual(["full_name", "programme", "dob"]);
    expect(result.verified["full_name"]).toBe("PRIYAM SHARMA");
    expect(result.verified["programme"]).toBe("B.Tech Computer Engineering");
    expect(result.verified["dob"]).toBe("2003-03-14");
    expect(result.skipped).toEqual([]);
  });

  it("leaves a field it does not have alone instead of guessing at it", async () => {
    const result = await fillPortal({
      url: `${base}/enrolment.html`,
      fields: [
        { name: "full_name", value: "PRIYAM SHARMA" },
        { name: "referee_phone", value: "+91 98200 11223" },
      ],
    });

    expect(result.filled).toEqual(["full_name"]);
    expect(result.skipped).toEqual(["referee_phone"]);
    expect(result.verified["referee_phone"]).toBeUndefined();
  });

  it("attaches a real file and reports the name the page sees", async () => {
    const result = await fillPortal({
      url: `${base}/enrolment.html`,
      fields: [],
      files: [{ name: "attach_id", paths: [join(DOCS, "passport.pdf")] }],
    });

    expect(result.filled).toEqual(["attach_id"]);
    expect(result.verified["attach_id"]).toBe("passport.pdf");
  });

  it("returns a screenshot of the filled page", async () => {
    const result = await fillPortal({
      url: `${base}/enrolment.html`,
      fields: [{ name: "full_name", value: "PRIYAM SHARMA" }],
    });

    const png = Buffer.from(result.screenshot, "base64");
    expect(png.length).toBeGreaterThan(5000);
    // PNG magic number.
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  }, 60_000);

  it("does not fill a control with the wrong value when two forms share a name", async () => {
    // The browser always has one document. The check that matters is that the
    // selector is scoped to the page it was given, not to every frame.
    const result = await fillPortal({
      url: `${base}/enrolment.html`,
      fields: [{ name: "gpa", value: "8.6" }],
    });
    expect(result.verified["gpa"]).toBe("8.6");
  });
});
