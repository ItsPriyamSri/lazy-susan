import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import type { Browser, BrowserContext, Page } from "playwright-core";
import { keyFor, coerce } from "./map.js";
import { labelFor, listControls } from "./controls.js";
import type { Control } from "./controls.js";

/**
 * One browser, kept open while a person finishes the form.
 *
 * The page is the product. A run opens it, types what the index can prove,
 * rings what it cannot, and then waits: the person types the rest into the same
 * page, or into the app, and either way nothing is submitted by the machine.
 */

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
  if (!found) throw new Error("no local browser found; set CHROME_PATH or BROWSERBASE_API_KEY");
  return found;
}

/** What the index says to do with this page. */
export interface PagePlan {
  /** key → value, for the fields the folder can prove. */
  values: Record<string, string>;
  /** key → why it is open. These get a ring, not a guess. */
  open: Record<string, string>;
  /** key → absolute path, for file inputs. */
  files?: Record<string, string>;
}

export type OutcomeStatus = "filled" | "open" | "unusable" | "not-ours";

export interface Outcome {
  handle: string;
  label: string;
  key: string | null;
  tag: string;
  type: string;
  status: OutcomeStatus;
  value?: string;
  /** Why it ended up this way, in words a person can act on. */
  reason?: string;
}

export interface PortalSession {
  readonly id: string;
  readonly mode: "local" | "browserbase";
  readonly sessionId?: string;
  readonly liveView?: string;
  url(): string;
  controls(): Promise<Control[]>;
  apply(plan: PagePlan): Promise<Outcome[]>;
  screenshot(): Promise<string>;
  close(): Promise<void>;
}

export interface OpenOptions {
  url: string;
  /** Headless is right for tests and servers; a person wants to watch. */
  headless?: boolean;
  /** Keep the cloud session alive between calls. */
  keepAlive?: boolean;
}

export async function openPortal(options: OpenOptions): Promise<PortalSession> {
  const mode = portalMode();
  const headless =
    options.headless ?? (process.env.PORTAL_HEADLESS === "1" ? true : !process.env.DISPLAY);

  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let sessionId: string | undefined;
  let liveView: string | undefined;

  if (mode === "browserbase") {
    const { default: Browserbase } = await import("@browserbasehq/sdk");
    const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });
    const session = await bb.sessions.create({ api_timeout: 300, keepAlive: options.keepAlive ?? true });
    sessionId = session.id;
    browser = await chromium.connectOverCDP(session.connectUrl);
    context = browser.contexts()[0] ?? (await browser.newContext());
    page = context.pages()[0] ?? (await context.newPage());

    // The little browser, embedded. Read/write, so the person can take over.
    const links = await bb.sessions.debug(session.id);
    liveView = links.debuggerFullscreenUrl ?? `https://browserbase.com/sessions/${session.id}`;
  } else {
    browser = await chromium.launch({
      executablePath: localExecutable(),
      headless,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    context = await browser.newContext({ viewport: { width: 1180, height: 900 } });
    page = await context.newPage();
  }

  await page.goto(options.url, { waitUntil: "load", timeout: 60_000 });
  // Forms that render after load are common; give them a beat, not a minute.
  await page.waitForTimeout(400);

  const id = sessionId ?? `local-${Date.now().toString(36)}`;

  /** Writes a value into a control, using the control it actually is. */
  async function setValue(control: Control, value: string): Promise<void> {
    const locator = page.locator(`[data-ls="${control.handle}"]`).first();

    if (control.tag === "select") {
      await locator.selectOption({ label: value });
      return;
    }
    if (control.tag === "input" && control.type === "checkbox") {
      if (value === "true") await locator.check();
      else await locator.uncheck();
      return;
    }
    if (control.tag === "input" && control.type === "file") {
      await locator.setInputFiles(value);
      return;
    }
    await locator.fill(value);
    // Some pages listen for input, some for change.
    await locator.dispatchEvent("change");
  }

  /** Green for filled, amber for "this one is yours". A screenshot should explain itself. */
  async function ring(marks: { handle: string; colour: string }[]): Promise<void> {
    if (marks.length === 0) return;
    await page.evaluate((list) => {
      for (const { handle, colour } of list) {
        const el = document.querySelector(`[data-ls="${handle}"]`);
        if (!(el instanceof HTMLElement)) continue;
        el.style.outline = `3px solid ${colour}`;
        el.style.outlineOffset = "2px";
        el.style.background = colour === "#b45309" ? "#fffbeb" : "#f0fdf4";
      }
    }, marks);
  }

  const session: PortalSession = {
    id,
    mode,
    sessionId,
    liveView,

    url: () => page.url(),

    controls: () => listControls(page),

    async apply(plan: PagePlan): Promise<Outcome[]> {
      const controls = await listControls(page);
      const outcomes: Outcome[] = [];
      const marks: { handle: string; colour: string }[] = [];

      for (const control of controls) {
        const key = keyFor(control);
        const label = labelFor(control);

        if (!key) {
          outcomes.push({ handle: control.handle, label, key: null, tag: control.tag, type: control.type, status: "not-ours" });
          continue;
        }

        const filePath = plan.files?.[key];
        if (control.tag === "input" && control.type === "file") {
          if (!filePath) {
            outcomes.push({
              handle: control.handle, label, key, tag: control.tag, type: control.type,
              status: "open", reason: "no file in the folder for this",
            });
            marks.push({ handle: control.handle, colour: "#b45309" });
            continue;
          }
          await setValue(control, filePath);
          outcomes.push({ handle: control.handle, label, key, tag: control.tag, type: control.type, status: "filled", value: filePath.split("/").pop() });
          marks.push({ handle: control.handle, colour: "#15803d" });
          continue;
        }

        const value = plan.values[key];
        if (value !== undefined) {
          const coerced = coerce(control, value);
          if (!coerced.ok) {
            outcomes.push({
              handle: control.handle, label, key, tag: control.tag, type: control.type,
              status: "unusable", value, reason: coerced.reason,
            });
            marks.push({ handle: control.handle, colour: "#b45309" });
            continue;
          }
          await setValue(control, coerced.value);
          outcomes.push({
            handle: control.handle, label, key, tag: control.tag, type: control.type,
            status: "filled", value: coerced.value, reason: coerced.note,
          });
          marks.push({ handle: control.handle, colour: "#15803d" });
          continue;
        }

        if (plan.open[key] !== undefined) {
          outcomes.push({
            handle: control.handle, label, key, tag: control.tag, type: control.type,
            status: "open", reason: plan.open[key],
          });
          marks.push({ handle: control.handle, colour: "#b45309" });
          continue;
        }

        outcomes.push({
          handle: control.handle, label, key, tag: control.tag, type: control.type,
          status: "open", reason: "nothing in the folder carries this",
        });
        marks.push({ handle: control.handle, colour: "#b45309" });
      }

      await ring(marks);
      return outcomes;
    },

    async screenshot(): Promise<string> {
      const buffer = await page.screenshot({ fullPage: true, type: "png" });
      return buffer.toString("base64");
    },

    async close(): Promise<void> {
      if (sessionId && process.env.BROWSERBASE_API_KEY) {
        try {
          const { default: Browserbase } = await import("@browserbasehq/sdk");
          const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });
          await bb.sessions.update(sessionId, { status: "REQUEST_RELEASE" });
        } catch {
          // Releasing is best effort; the session expires on its own.
        }
      }
      await browser.close().catch(() => {});
    },
  };

  return session;
}
