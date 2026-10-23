import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { KEY } from "@lazy-susan/core";
import { readDocument, readOne, readPdf } from "@lazy-susan/reader";
import { initSentry, withSpan } from "@lazy-susan/sentry";
import { NoVoiceKey, briefScript, speak } from "@lazy-susan/elevenlabs";
import { bearerFrom, isEnabled as authEnabled, verifyToken } from "@lazy-susan/auth0";
import { answerId, mirror as atlasMirror } from "@lazy-susan/atlas";
import { deploymentReport, readBlueprint } from "@lazy-susan/render";
import {
  closeAllPortals,
  closePortal,
  labelsFor,
  planFromIndex,
  planFromRun,
  reapPortals,
  refillPortal,
  startPortal,
} from "./portal.js";
import { fillHtml, fillPdf } from "./fill.js";
import { pagePng } from "./pages.js";
import { CORPUS, OUT, essayFor, loadState, rulesWith, runOf } from "./state.js";
import { readContext, writeContext } from "./context.js";

const app = new Hono();
let state = loadState();
const tracing = initSentry();
const JOURNAL_FILE = join(OUT, ".journal.json");
const atlas = atlasMirror();
const blueprint = readBlueprint(join(import.meta.dirname, "../../../render.yaml"));
let mirroredUpTo = 0;

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

  if (!atlas) return;
  const pending = state.journal.entries.slice(mirroredUpTo);
  mirroredUpTo = state.journal.entries.length;
  void (async () => {
    for (const entry of pending) {
      if (entry.op.op === "commit") continue; // documents are read here, not carried
      try {
        await atlas.append({ id: answerId(entry.op), at: entry.at, op: entry.op });
      } catch (err) {
        // The disk copy is already written, so a failed mirror is a warning and
        // a retry on the next write, not a lost answer.
        mirroredUpTo = 0;
        console.warn(`atlas: ${(err as Error).message}; will retry on the next write`);
        return;
      }
    }
  })();
}

function recalc(): void {
  state.index = state.journal.rebuild();
  persist();
}

/**
 * Re-reads the folder after a document or the notes change.
 *
 * A reload must not throw away answers typed on this machine: the journal is
 * memory first, disk second, and a fresh `loadState` knows nothing about either.
 * So the non-commit entries are carried over, de-duplicated against what the
 * new state already holds, and the index is rebuilt from the union.
 */
function reloadState(): void {
  const carried = state.journal.entries.filter((e) => e.op.op !== "commit");
  state = loadState();

  for (const entry of carried) {
    const op = entry.op;
    if (op.op !== "attest" && op.op !== "resolve") continue;
    const same = state.journal.entries.some(
      (e) =>
        e.op.op === op.op &&
        (e.op.op === "attest" || e.op.op === "resolve") &&
        e.op.fact.key === op.fact.key &&
        e.op.fact.value === op.fact.value,
    );
    if (same) continue;
    state.journal.append(op, entry.at);
  }

  state.index = state.journal.rebuild();
  mirroredUpTo = 0;
  persist();
}

/**
 * Answers from another machine come back before the first request is served.
 * Only answers: the documents were never sent anywhere, so this machine reads
 * them from its own folder and the two together are the same ledger.
 */
if (atlas) {
  try {
    const rows = await atlas.answers();
    const already = new Set(
      state.journal.entries.filter((e) => e.op.op !== "commit").map((e) => answerId(e.op)),
    );

    let restored = 0;
    for (const row of rows) {
      if (already.has(row.id)) continue;
      state.journal.append(row.op as never, new Date().toISOString());
      restored += 1;
    }

    if (restored > 0) {
      state.index = state.journal.rebuild();
      console.log(`journal: ${restored} answer(s) restored from atlas`);
    }
    persist();
  } catch (err) {
    console.warn(`atlas unavailable at start: ${(err as Error).message}`);
  }
}

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    documents: state.docs.length,
    // Which of the keys this deployment was given are present. Booleans only,
    // because a health check is a public page.
    deployment: deploymentReport(blueprint),
  }),
);

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
    context: state.context,
    keys: KEY,
  }),
);

/** The paragraph about you, kept in the folder as one small file. */
app.get("/api/context", (c) => c.json(state.context));

app.post("/api/context", async (c) => {
  const body = await c.req.json<{ text?: string }>().catch(() => ({}) as never);
  const text = typeof body.text === "string" ? body.text : "";
  if (text.length > 20_000) return c.json({ error: "that is longer than a paragraph; keep it under 20,000 characters" }, 400);
  const written = writeContext(text);
  reloadState();
  return c.json({ context: { text: written.text, savedAt: written.savedAt }, indexHash: state.index.hash() });
});

/**
 * A document arrives from the page, not from the generator.
 *
 * It is written into the same folder the night run reads, read immediately, and
 * its extraction is written where the next start will find it. The name is
 * stripped to a bare file name: this endpoint takes one file, not a path.
 */
app.post("/api/documents", async (c) => {
  const form = await c.req.parseBody();
  const file = form.file;
  if (!(file instanceof File)) return c.json({ error: "send one file in the `file` field" }, 400);

  const name = file.name.split(/[\\/]/).pop()?.replace(/[^\w.\- ()]/g, "").trim() ?? "";
  if (!name || !/\.(pdf|docx|txt|md)$/i.test(name)) {
    return c.json({ error: "only .pdf, .docx, .txt and .md are read" }, 400);
  }

  const docsDir = join(CORPUS, "docs");
  mkdirSync(docsDir, { recursive: true });
  const path = join(docsDir, name);
  writeFileSync(path, new Uint8Array(await file.arrayBuffer()));

  const extraction = readOne(docsDir, name);
  const extractionsDir = join(CORPUS, "extractions");
  mkdirSync(extractionsDir, { recursive: true });
  writeFileSync(
    join(extractionsDir, `${name.replace(/\.[^.]+$/, "")}.json`),
    JSON.stringify(extraction, null, 2),
  );

  reloadState();

  return c.json({
    file: name,
    kind: extraction.kind,
    readable: extraction.readable,
    facts: extraction.facts.length,
    unplaced: extraction.stats.unplaced.length,
    extraction,
  });
});

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

  // The page keeps answers in its own state and pushes them here when it needs
  // the server to know. Sending the same one twice must not grow the journal.
  const already = state.journal.entries.some(
    (e) => e.op.op === "attest" && e.op.fact.key === body.key && e.op.fact.value === body.value.trim(),
  );
  if (already) return c.json({ ok: true, indexHash: state.index.hash(), already: true });

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

/**
 * The text of a file that has no pages, so the interface can show the line a
 * value came from with the lines around it.
 */
app.get("/api/document/:file", (c) => {
  const file = c.req.param("file").replace(/[^\w.-]/g, "");
  const path = join(CORPUS, "docs", file);
  if (!existsSync(path)) return c.notFound();
  if (/\.pdf$/i.test(file)) return c.json({ file, format: "pdf" as const, lines: [] as string[] });

  const raw = readDocument(path, readPdf);
  return c.json({
    file,
    format: raw.format,
    lines: raw.pages.flatMap((p) => p.lines.map((l) => l.text)),
  });
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

  for (const field of spec.fields.filter((f) => f.type === "textarea")) {
    const view = await essayFor(state, formId, field.label, false);
    if (view.draft.refused || !view.draft.text) {
      plan.blocked.push(`${field.label}: ${view.draft.refused ?? "nothing written yet"}`);
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


/**
 * The standout: the page itself.
 *
 * Start a browser, type what the index can prove, ring what it cannot, and
 * leave it open. Nothing here presses submit.
 */
app.post("/api/portal/start", async (c) => {
  const body = await c.req.json<{ formId?: string; url?: string; months?: number }>();
  const months = Number(body.months ?? 3);

  if (body.url?.trim()) {
    const plan = planFromIndex(state.index);
    const portal = await withSpan("portal", "portal", () =>
      startPortal({ url: body.url!.trim(), formId: "any", plan }),
    );
    return c.json({
      id: portal.id,
      formId: portal.formId,
      mode: portal.session.mode,
      liveView: portal.session.liveView,
      url: portal.session.url(),
      outcomes: portal.outcomes,
      screenshot: await portal.session.screenshot(),
      plan,
      note: "No form spec for this page, so the rules that need one did not run.",
    });
  }

  const spec = state.forms.find((f) => f.id === (body.formId ?? "enrolment"));
  if (!spec) return c.notFound();

  const html = join(CORPUS, "forms", `${spec.id}.html`);
  if (!existsSync(html)) {
    return c.json(
      { error: `${spec.title} is a PDF, and a browser cannot type into a PDF. Use the enrol file, or give a URL.` },
      400,
    );
  }

  const run = runOf(state, spec.id, rulesWith({ addressProofMaxAgeMonths: months }));
  const plan = planFromRun(run);
  plan.byLabel = labelsFor(spec);

  for (const field of spec.fields.filter((f) => f.type === "textarea")) {
    const view = await essayFor(state, spec.id, field.label, false);
    if (!view.draft.refused && view.draft.text) plan.values[field.key] = view.draft.text;
  }

  // The browser runs next to the server, so it talks to it over loopback. The
  // request's own origin is the public one and may not be reachable from in
  // here, and on a mapped port it is not the port the server listens on.
  const url = `http://127.0.0.1:${Number(process.env.PORT ?? 4757)}/forms/${spec.id}.html`;
  const portal = await withSpan(`portal ${spec.id}`, "portal", () =>
    startPortal({ url, formId: spec.id, plan }),
  );

  return c.json({
    id: portal.id,
    formId: portal.formId,
    mode: portal.session.mode,
    liveView: portal.session.liveView,
    url: portal.session.url(),
    outcomes: portal.outcomes,
    screenshot: await portal.session.screenshot(),
    plan,
  });
});

/** Types the answers you have given since into the same open page. */
app.post("/api/portal/refill/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ formId?: string; months?: number }>().catch(() => ({}) as never);
  const months = Number(body.months ?? 3);

  const spec = body.formId ? state.forms.find((f) => f.id === body.formId) : undefined;
  const plan = spec
    ? planFromRun(runOf(state, spec.id, rulesWith({ addressProofMaxAgeMonths: months })))
    : planFromIndex(state.index);

  if (spec) {
    plan.byLabel = labelsFor(spec);
    for (const field of spec.fields.filter((f) => f.type === "textarea")) {
      const view = await essayFor(state, spec.id, field.label, false);
      if (!view.draft.refused && view.draft.text) plan.values[field.key] = view.draft.text;
    }
  }

  const portal = await refillPortal(id, plan);
  if (!portal) return c.json({ error: "that browser is closed" }, 404);

  return c.json({
    id: portal.id,
    mode: portal.session.mode,
    liveView: portal.session.liveView,
    outcomes: portal.outcomes,
    screenshot: await portal.session.screenshot(),
    plan,
  });
});

app.post("/api/portal/close/:id", async (c) => {
  const closed = await closePortal(c.req.param("id"));
  return c.json({ closed });
});

app.use("/files/*", serveStatic({ root: OUT }));
// The pages a browser can be pointed at. A PDF is not one of them.
app.use("/forms/*", serveStatic({ root: CORPUS }));
app.use("/*", serveStatic({ root: join(import.meta.dirname, "../../web/dist") }));
app.get("*", serveStatic({ path: join(import.meta.dirname, "../../web/dist/index.html") }));

// A browser left open on a machine nobody is watching is a bug.
setInterval(() => void reapPortals(15), 5 * 60_000).unref();
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void closeAllPortals().finally(() => process.exit(0));
  });
}

const port = Number(process.env.PORT ?? 4757);
serve({ fetch: app.fetch, port }, (info) => {
  if (tracing) console.log('sentry tracing on');
  console.log(`lazy susan brain on http://localhost:${info.port}`);
  console.log(`${state.docs.length} documents, ${state.counters.facts} facts, journal ${state.journal.entries.length} entries`);
});
