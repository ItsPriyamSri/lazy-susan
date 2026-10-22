import * as Sentry from "@sentry/node";

let started = false;

/**
 * Tracing, but only if you asked for it.
 *
 * With no SENTRY_DSN set every call below is a no-op, which is what keeps the
 * promise that nothing leaves the laptop. With a DSN, one span per document read
 * and one per form run, so a slow night has a picture instead of a guess.
 */
export function initSentry(): boolean {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;
  if (started) return true;
  Sentry.init({
    dsn,
    tracesSampleRate: 1.0,
    environment: process.env.SENTRY_ENVIRONMENT ?? "local",
    release: process.env.SENTRY_RELEASE ?? "lazy-susan@0.1.0",
  });
  started = true;
  return true;
}

export async function withSpan<T>(name: string, op: string, fn: () => Promise<T> | T): Promise<T> {
  if (!started) return fn();

  return Sentry.startSpan({ name, op }, async () => {
    try {
      const result = await fn();
      Sentry.addBreadcrumb({ category: op, message: name, level: "info" });
      return result;
    } catch (err) {
      Sentry.captureException(err);
      throw err;
    }
  });
}

export function isOn(): boolean {
  return started;
}

/** Tests only: forget that init ever happened. */
export async function resetSentry(): Promise<void> {
  if (!started) return;
  await Sentry.close(2000);
  started = false;
}

export function note(message: string, data?: Record<string, unknown>): void {
  if (!started) return;
  Sentry.addBreadcrumb({ category: "lazy-susan", message, level: "info", data });
}
