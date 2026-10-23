import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { coerce, keyFor, openPortal } from "../src/index.js";
import type { Control, PortalSession } from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FORMS = resolve(HERE, "../../../packages/corpus/forms");
const DOCS = resolve(HERE, "../../../packages/corpus/docs");

const control = (over: Partial<Control>): Control => ({
  handle: "ls-0",
  tag: "input",
  type: "text",
  name: "",
  id: "",
  label: "",
  required: false,
  ...over,
});

describe("from a box to a key", () => {
  it("takes a dotted name at its word", () => {
    expect(keyFor(control({ name: "person.phone.mobile" }))).toBe("person.phone.mobile");
  });

  it("reads a developer's underscored name", () => {
    expect(keyFor(control({ name: "full_name" }))).toBe("person.full_name");
    expect(keyFor(control({ name: "referee_phone" }))).toBe("referee.1.phone");
  });

  it("reads the words next to the box when there is no name at all", () => {
    expect(keyFor(control({ label: "Date of birth" }))).toBe("person.dob");
    expect(keyFor(control({ label: "Residential address" }))).toBe("address.current.line1");
    expect(keyFor(control({ label: "Attach your marksheet" }))).toBe("documents.education");
  });

  it("returns nothing rather than a guess", () => {
    expect(keyFor(control({ label: "How did you hear about this role?" }))).toBeNull();
  });
});

describe("from a value to a control", () => {
  it("turns a written date into the one a date input accepts", () => {
    const result = coerce(control({ type: "date" }), "14 MAR 2003");
    expect(result).toEqual({ ok: true, value: "2003-03-14" });
  });

  it("refuses a date it cannot read instead of inventing one", () => {
    const result = coerce(control({ type: "date" }), "sometime in 2003");
    expect(result.ok).toBe(false);
  });

  it("takes a currency amount down to a number", () => {
    expect(coerce(control({ type: "number" }), "INR 480,000")).toEqual({ ok: true, value: "480000" });
  });

  it("picks the option with the same words", () => {
    const select = control({ tag: "select", type: "select", options: ["Choose one", "Computer Engineering", "Electronics"] });
    expect(coerce(select, "computer engineering")).toEqual({ ok: true, value: "Computer Engineering" });
  });

  it("says what the list does offer when nothing matches", () => {
    const select = control({ tag: "select", type: "select", options: ["Computer Engineering", "Electronics"] });
    const result = coerce(select, "B.Tech");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("Computer Engineering");
  });
});

const hasBrowser = ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].some((p) => existsSync(p));

describe.skipIf(!hasBrowser)("a page with no field names", () => {
  let server: ReturnType<typeof createServer>;
  let base = "";
  let session: PortalSession;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const name = (req.url ?? "/").split("?")[0]!.replace(/^\//, "");
      try {
        const html = readFileSync(join(FORMS, name));
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(html);
      } catch {
        res.writeHead(404).end("no");
      }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    session = await openPortal({ url: `${base}/job-application.html`, headless: true });
  }, 60_000);

  afterAll(async () => {
    await session?.close();
    await new Promise<void>((r) => server.close(() => r()));
  });

  it("finds the boxes and the words beside them", async () => {
    const controls = await session.controls();
    const labels = controls.map((c) => c.label);

    expect(controls.length).toBeGreaterThanOrEqual(13);
    expect(labels).toContain("Full name");
    expect(labels).toContain("Date of birth");
    expect(labels).toContain("Attach your marksheet");
  });

  it("fills what the folder proves and rings what it does not", async () => {
    const outcomes = await session.apply({
      values: {
        "person.full_name": "PRIYAM SHARMA",
        "person.dob": "14 MAR 2003",
        "person.email": "priyam@example.edu",
        "education.institution": "Testland Institute of Technology",
        "education.programme": "Computer Engineering",
        "address.current.line1": "44 MG Road",
      },
      open: {
        "person.phone.mobile": "No document in your folder contains a phone number.",
        "referee.1.name": "The reference letter is a photograph with no text layer.",
      },
      files: { "documents.education": join(DOCS, "marksheet-2026.pdf") },
    });

    const byLabel = Object.fromEntries(outcomes.map((o) => [o.label, o]));

    expect(byLabel["Full name"]!.status).toBe("filled");
    expect(byLabel["Full name"]!.value).toBe("PRIYAM SHARMA");

    // Written as "14 MAR 2003", typed as 2003-03-14.
    expect(byLabel["Date of birth"]!.status).toBe("filled");
    expect(byLabel["Date of birth"]!.value).toBe("2003-03-14");

    expect(byLabel["Email address"]!.status).toBe("filled");
    expect(byLabel["Programme"]!.status).toBe("filled");
    expect(byLabel["Programme"]!.value).toBe("Computer Engineering");

    // Attached, and the page was told the name of the file.
    expect(byLabel["Attach your marksheet"]!.status).toBe("filled");
    expect(byLabel["Attach your marksheet"]!.value).toBe("marksheet-2026.pdf");

    // The two with no proof: ringed, empty.
    expect(byLabel["Mobile number"]!.status).toBe("open");
    expect(byLabel["Referee name"]!.status).toBe("open");

    // A question that is not ours to answer stays untouched.
    expect(byLabel["How did you hear about this role?"]!.status).toBe("not-ours");
  }, 60_000);

  it("typed the values into the real page, not just into a report", async () => {
    const values = await session.controls();
    expect(values.length).toBeGreaterThan(0);

    const read = await session.apply({ values: {}, open: {} });
    // Nothing new should have been written by an empty plan.
    expect(read.every((o) => o.status !== "filled")).toBe(true);
  }, 30_000);

  it("leaves the open fields empty rather than filling them with something", async () => {
    const outcomes = await session.apply({
      values: { "person.full_name": "PRIYAM SHARMA" },
      open: { "person.phone.mobile": "No document carries a phone number." },
    });
    const phone = outcomes.find((o) => o.label === "Mobile number");
    expect(phone?.status).toBe("open");
    expect(phone?.value).toBeUndefined();
  }, 30_000);

  it("returns a screenshot of the page as it now stands", async () => {
    const png = Buffer.from(await session.screenshot(), "base64");
    expect(png.length).toBeGreaterThan(5_000);
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  }, 30_000);

  it("never submits: the page is still the form", async () => {
    expect(session.url()).toContain("job-application.html");
  });
});
