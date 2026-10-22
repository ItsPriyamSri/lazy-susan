import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { KEY } from "@lazy-susan/core";
import { initSentry, withSpan } from "@lazy-susan/sentry";
import { NoVoiceKey, briefScript, speak } from "@lazy-susan/elevenlabs";
import { bearerFrom, isEnabled as authEnabled, verifyToken } from "@lazy-susan/auth0";
import { fillHtml, fillPdf } from "./fill.js";
import { pagePng } from "./pages.js";
import { CORPUS, OUT, essayFor, loadState, rulesWith, runOf } from "./state.js";

const app = new Hono();
const state = loadState();
const tracing = initSentry();
const JOURNAL_FILE = join(OUT, ".journal.json");

app.use(
  "/api/*",
  cors({
    origin: (o) => o ?? "*",
    allowHeaders: ["content-type", "authorization"],
  }),
);

/**
 * The folder behind this API holds a passport scan. When a tenant is
 * configured, nothing but the health check is answered without a token.
 */
app.use("/api/*", async (c, next) => {
  if (!authEnabled() || c.req.path === "/api/health") return next();
  try {
    await verifyToken(bearerFrom(c.req.header("authorization")));
  } catch (err) {
    return c.json({ error: "sign in first", detail: (err as Error).message }, 401);
  }
  return next();
});

function persist(): void {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(JOURNAL_FILE, JSON.stringify(state.journal.entries, null, 2));
}

function recalc(): void {
  state.index = state.journal.rebuild();
  persist();
}

app.get("/api/health", (c) => c.json({ ok: true, documents: state.docs.length }));

app.get("/api/state", (c) =>
  c.json({
    readAt: state.readAt,
    counters: state.counters,
    documents: state.docs,
    forms: state.forms.map((f) => ({ id: f.id, title: f.title, kind: f.kind, fields: f.fields.length })),
    indexHash: state.index.hash(),
    journal: {
      entries: state.journal.entries.length,
      head: state.journal.head(),
      verified: state.journal.verify(),
    },
    keys: KEY,
  }),
);

app.get("/api/form/:id", async (c) => {
  const formId = c.req.param("id");
  const months = Number(c.req.query("months") ?? 3);
  const rules = rulesWith({ addressProofMaxAgeMonths: Number.isFinite(months) ? months : 3 });
  const run = await withSpan(`resolve ${formId}`, "resolve", async () => runOf(state, formId, rules));
  return c.json({ run, rules });
});

app.post("/api/answer", async (c) => {
  const body = await c.req.json<{ formId: string; key: string; value: string }>();
  if (!body.key || !body.value?.trim()) return c.json({ error: "key and value are required" }, 400);
  state.journal.append(
    {
      op: "attest",
      label: `answer ${body.key}`,
      fact: {
        key: body.key,
        value: body.value.trim(),
        source: { kind: "attested", at: new Date().toISOString(), formId: body.formId, by: "human" },
      },
    },
    new Date().toISOString(),
  );
  recalc();
  return c.json({ ok: true, indexHash: state.index.hash() });
});

app.post("/api/resolve", async (c) => {
  const body = await c.req.json<{ formId: string; key: string; value: string; against: string }>();
  state.journal.append(
    {
      op: "resolve",
      label: `resolve ${body.key}`,
      fact: {
        key: body.key,
        value: body.value,
        source: {
          kind: "attested",
          at: new Date().toISOString(),
          formId: body.formId,
          by: "human",
          resolvedAgainst: body.against,
        },
      },
    },
    new Date().toISOString(),
  );
  recalc();
  return c.json({ ok: true, indexHash: state.index.hash() });
});

app.post("/api/undo", (c) => {
  const before = state.index.hash();
  const { removed } = state.journal.undo();
  recalc();
  return c.json({
    ok: Boolean(removed),
    removed: removed ? { seq: removed.seq, label: removed.op.label, hash: removed.hash } : null,
    before,
    after: state.index.hash(),
  });
});

app.get("/api/page/:file/:page", (c) => {
  const file = c.req.param("file");
  const page = Math.max(1, Number(c.req.param("page")) || 1);
  const png = pagePng(file, page);
  return c.body(readFileSync(png), 200, { "content-type": "image/png", "cache-control": "public, max-age=3600" });
});

app.get("/api/doc/:file", (c) => {
  const file = c.req.param("file").replace(/[^\w.-]/g, "");
  const path = join(CORPUS, "docs", file);
  if (!existsSync(path)) return c.notFound();
  return c.body(readFileSync(path), 200, { "content-type": "application/pdf" });
});

app.post("/api/essay", async (c) => {
  const body = await c.req.json<{ formId: string; text?: string; question?: string; allowModel?: boolean }>();
  const spec = state.forms.find((f) => f.id === body.formId);
  const question = body.question ?? spec?.fields.find((f) => f.type === "textarea")?.label ?? "Why are you a good fit?";
  const view = await withSpan("draft the paragraph", "llm", async () =>
    essayFor(state, body.formId, question, body.allowModel ?? true),
  );
  return c.json(view);
});

app.get("/api/brief/:id", async (c) => {
  const formId = c.req.param("id");
  const spec = state.forms.find((f) => f.id === formId);
  if (!spec) return c.notFound();

  const run = runOf(state, formId, rulesWith(undefined));
  const open = run.fields
    .filter((f) => f.verdict !== "FILLED")
    .map((f) => ({ label: f.field.label, reason: f.reason ?? "" }));

  const script = briefScript({ formTitle: spec.title, open });

  try {
    const speech = await withSpan("read the morning list", "voice", async () => speak({ text: script }));
    return c.body(new Uint8Array(speech.audio), 200, {
      "content-type": speech.contentType,
      "x-voice": `${speech.voiceId}/${speech.modelId}`,
    });
  } catch (err) {
    if (err instanceof NoVoiceKey) {
      // No key: hand the script back and let the browser read it itself.
      return c.json({ spoken: false, script });
    }
    throw err;
  }
});

app.post("/api/fill/:id", async (c) => {
  const formId = c.req.param("id");
  const months = Number(c.req.query("months") ?? 3);
  const spec = state.forms.find((f) => f.id === formId);
  if (!spec) return c.notFound();

  const run = runOf(state, formId, rulesWith({ addressProofMaxAgeMonths: months }));
  const { planFill } = await import("@lazy-susan/core");
  const plan = await withSpan(`write ${formId}`, "fill", async () => planFill(run));
  mkdirSync(OUT, { recursive: true });

  const essayField = spec.fields.find((f) => f.type === "textarea");
  if (essayField) {
    const view = await essayFor(state, formId, essayField.label, false);
    if (view.draft.refused || !view.draft.text) {
      plan.blocked.push(`The paragraph: ${view.draft.refused ?? "nothing written yet"}`);
    }
  }

  if (spec.kind === "pdf") {
    const out = join(OUT, `${formId}.filled.pdf`);
    const result = await fillPdf(join(CORPUS, "forms", `${formId}.pdf`), plan, out);
    return c.json({ kind: "pdf", file: `${formId}.filled.pdf`, url: `/files/${formId}.filled.pdf`, ...result, plan });
  }

  const html = fillHtml(join(CORPUS, "forms", "enrolment.html"), plan);
  writeFileSync(join(OUT, `${formId}.filled.html`), html);
  return c.json({ kind: "html", file: `${formId}.filled.html`, url: `/files/${formId}.filled.html`, plan });
});

app.use("/files/*", serveStatic({ root: OUT }));
app.use("/*", serveStatic({ root: join(import.meta.dirname, "../../web/dist") }));
app.get("*", serveStatic({ path: join(import.meta.dirname, "../../web/dist/index.html") }));

const port = Number(process.env.PORT ?? 4757);
serve({ fetch: app.fetch, port }, (info) => {
  if (tracing) console.log('sentry tracing on');
  console.log(`lazy susan brain on http://localhost:${info.port}`);
  console.log(`${state.docs.length} documents, ${state.counters.facts} facts, journal ${state.journal.entries.length} entries`);
});
