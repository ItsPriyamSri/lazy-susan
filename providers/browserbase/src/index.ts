import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import type { Browser, Frame, Locator, Page } from "playwright-core";

/**
 * Fills a form in a real browser.
 *
 * Two modes and the same code path. With BROWSERBASE_API_KEY set the page runs
 * in a Browserbase session, which is what makes a portal that only exists on the
 * public internet reachable from a laptop. Without the key it runs in a local
 * Chrome, so the feature is testable and nothing is locked behind an account.
 */

export interface PortalField {
  /** The name attribute of the control. */
  name: string;
  value: string;
}

export interface PortalFile {
  name: string;
  /** Absolute paths to attach, in order. */
  paths: string[];
}

export interface PortalJob {
  url: string;
  fields: PortalField[];
  files?: PortalFile[];
  /** Trim the screenshot to this height in CSS pixels. */
  maxHeight?: number;
}

export interface PortalResult {
  mode: "local" | "browserbase";
  sessionId?: string;
  liveView?: string;
  filled: string[];
  skipped: string[];
  /** What the page actually held after typing, read back from the DOM. */
  verified: Record<string, string>;
  screenshot: string;
  ms: number;
}

const LOCAL_BROWSERS = [
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
];

export function portalMode(): "local" | "browserbase" {
  return process.env.BROWSERBASE_API_KEY ? "browserbase" : "local";
}

function localExecutable(): string {
  const found = process.env.CHROME_PATH ?? LOCAL_BROWSERS.find((p) => existsSync(p));
  if (!found) {
    throw new Error("no local browser found; set CHROME_PATH or BROWSERBASE_API_KEY");
  }
  return found;
}

async function open(): Promise<{
  browser: Browser;
  page: Page;
  mode: PortalResult["mode"];
  sessionId?: string;
  liveView?: string;
}> {
  if (portalMode() === "browserbase") {
    const { default: Browserbase } = await import("@browserbasehq/sdk");
    const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });
    const session = await bb.sessions.create({ timeout: 120 });
    const browser = await chromium.connectOverCDP(session.connectUrl);
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());
    return {
      browser,
      page,
      mode: "browserbase",
      sessionId: session.id,
      liveView: `https://browserbase.com/sessions/${session.id}`,
    };
  }

  const browser = await chromium.launch({
    executablePath: localExecutable(),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 1180, height: 900 } });
  return { browser, page, mode: "local" };
}

/** Finds a control by its name, then by its id, because forms are written by people. */
async function control(root: Page | Frame, name: string): Promise<Locator | null> {
  for (const selector of [`[name="${name}"]`, `#${name}`, `[name="${name.replace(/_/g, "-")}"]`]) {
    const locator = root.locator(selector).first();
    if ((await locator.count()) > 0) return locator;
  }
  return null;
}

async function readBack(locator: Locator): Promise<string> {
  const tag = await locator.evaluate((el) => el.tagName.toLowerCase());
  if (tag === "select") return locator.evaluate((el) => (el as HTMLSelectElement).value);
  if (tag === "input") {
    const type = await locator.getAttribute("type");
    if (type === "file") return locator.evaluate((el) => {
      const input = el as HTMLInputElement;
      return Array.from(input.files ?? []).map((f) => f.name).join(", ");
    });
  }
  return locator.inputValue();
}

export async function fillPortal(job: PortalJob, log: (line: string) => void = () => {}): Promise<PortalResult> {
  const started = Date.now();
  const { browser, page, mode, sessionId, liveView } = await open();

  const filled: string[] = [];
  const skipped: string[] = [];
  const verified: Record<string, string> = {};

  try {
    log(`opening ${job.url} in ${mode}`);
    await page.goto(job.url, { waitUntil: "load", timeout: 45_000 });

    for (const field of job.fields) {
      const locator = await control(page, field.name);
      if (!locator) {
        skipped.push(field.name);
        continue;
      }
      const tag = await locator.evaluate((el) => el.tagName.toLowerCase());
      if (tag === "select") await locator.selectOption({ label: field.value }).catch(() => locator.selectOption(field.value));
      else await locator.fill(field.value);
      filled.push(field.name);
      verified[field.name] = await readBack(locator);
    }

    for (const file of job.files ?? []) {
      const locator = await control(page, file.name);
      if (!locator) {
        skipped.push(file.name);
        continue;
      }
      await locator.setInputFiles(file.paths);
      filled.push(file.name);
      verified[file.name] = await readBack(locator);
    }

    // Let the page settle so the screenshot is of the filled form, not a paint in flight.
    await page.waitForTimeout(250);

    const buffer = await page.screenshot({ fullPage: true, type: "png" });

    return {
      mode,
      sessionId,
      liveView,
      filled,
      skipped,
      verified,
      screenshot: buffer.toString("base64"),
      ms: Date.now() - started,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}
