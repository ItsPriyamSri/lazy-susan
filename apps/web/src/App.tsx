import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getJson, postJson } from "./lib/api";
import type {
  ApiState,
  EssayResponse,
  FieldResult,
  FillResponse,
  FormResponse,
  HealthResponse,
  PortalResponse,
  UndoResponse,
} from "./lib/types";
import { FormView } from "./components/FormView";
import { Overview } from "./components/Overview";
import { ProvenanceDrawer } from "./components/ProvenanceDrawer";
import { Sidebar } from "./components/Sidebar";
import { ApiBanner, Skeleton } from "./components/States";
import { TopBar } from "./components/TopBar";
import { Toasts } from "./components/Toasts";
import type { NeedItem } from "./components/NeedsYou";
import type { EssayCardState } from "./components/EssayCard";
import type { BrowserView } from "./components/BrowserPanel";
import { messageOf } from "./components/Proof";

type Route = { kind: "overview" } | { kind: "form"; formId: string };

function routeFromHash(): Route {
  const id = window.location.hash.replace(/^#/, "");
  return id ? { kind: "form", formId: id } : { kind: "overview" };
}

export default function App(): JSX.Element {
  const [route, setRoute] = useState<Route>(routeFromHash);
  const [status, setStatus] = useState<"loading" | "ready" | "down">("loading");
  const [state, setState] = useState<ApiState | null>(null);
  const [runs, setRuns] = useState<Record<string, FormResponse | undefined>>({});
  const [months, setMonths] = useState(3);
  const [essays, setEssays] = useState<Record<string, EssayCardState[]>>({});
  const [browser, setBrowser] = useState<BrowserView | null>(null);
  const [browserBusy, setBrowserBusy] = useState(false);
  const [browserError, setBrowserError] = useState<string | null>(null);
  const [fillBusy, setFillBusy] = useState(false);
  const [fill, setFill] = useState<Record<string, FillResponse | undefined>>({});
  const [fillError, setFillError] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<FieldResult | null>(null);
  const [changes, setChanges] = useState(0);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);

  const toast = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  }, []);

  useEffect(() => {
    const onHash = (): void => setRoute(routeFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  /** Every load starts with the health check, because the folder is behind it. */
  const load = useCallback(async (): Promise<void> => {
    setStatus("loading");
    try {
      const [heart, body] = await Promise.all([
        getJson<HealthResponse>("/api/health"),
        getJson<ApiState>("/api/state"),
      ]);
      if (!heart.ok) throw new Error("the health check said no");
      setState(body);
      setStatus("ready");
    } catch {
      setStatus("down");
    }
  }, []);

  /** The folder and every form run, refetched together after any change. */
  const refresh = useCallback(async (monthOverride?: number): Promise<void> => {
    const body = await getJson<ApiState>("/api/state");
    setState(body);
    const ids = body.forms.map((f) => f.id);
    const results = await Promise.all(
      ids.map((id) =>
        getJson<FormResponse>(`/api/form/${id}?months=${monthOverride ?? months}`).catch(
          () => undefined,
        ),
      ),
    );
    setRuns(Object.fromEntries(ids.map((id, i) => [id, results[i]])));
  }, [months]);

  useEffect(() => {
    void (async () => {
      await load();
      try {
        await refresh();
      } catch {
        // The banner already tells the reader what to do.
      }
    })();
    // One wiring on mount; later reloads come from the refresh button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status === "ready") void refresh(months).catch(() => undefined);
    // Changing the tolerance re-runs every form on the server.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months]);

  // --- answers --------------------------------------------------------------
  const answer = useCallback(
    async (formId: string, key: string, value: string, against?: string): Promise<string | null> => {
      try {
        await postJson(
          against ? "/api/resolve" : "/api/answer",
          against ? { formId, key, value, against } : { formId, key, value },
        );
        setChanges((n) => n + 1);
        await refresh();
        return null;
      } catch (e) {
        return messageOf(e);
      }
    },
    [refresh],
  );

  const undo = useCallback(async (): Promise<void> => {
    try {
      const res = await postJson<UndoResponse>("/api/undo", {});
      if (res.removed) {
        setChanges((n) => Math.max(0, n - 1));
        toast(`Undone: ${res.removed.label}`);
      } else {
        toast("Nothing is left to undo.");
      }
      await refresh();
    } catch (e) {
      toast(messageOf(e));
    }
  }, [refresh, toast]);

  // --- paragraph questions --------------------------------------------------
  /**
   * One card per requested paragraph. `slot` is what the reader asked for; the
   * server answers with `view.question`, its own wording.
   */
  const askEssay = useCallback(
    async (formId: string, slot: string, question?: string, allowModel?: boolean, key?: string): Promise<void> => {
      updateCard(setEssays, formId, slot, (c) => ({
        slot,
        question: c?.question ?? question ?? "",
        key: key ?? c?.key,
        view: undefined,
        loading: true,
        modelNote: Boolean(allowModel),
        error: undefined,
      }));
      try {
        const view = await postJson<EssayResponse>("/api/essay", {
          formId,
          ...(question ? { question } : {}),
          allowModel: allowModel ?? false,
        });
        updateCard(setEssays, formId, slot, (c) => ({
          slot,
          question: view.question,
          key: key ?? c?.key,
          view,
          loading: false,
          modelNote: false,
          error: undefined,
        }));
      } catch (e) {
        const error = messageOf(e);
        updateCard(setEssays, formId, slot, (c) => ({
          slot,
          question: c?.question ?? question ?? "",
          key: key ?? c?.key,
          view: undefined,
          loading: false,
          modelNote: false,
          error,
        }));
      }
    },
    [],
  );

  /**
   * Every paragraph question the form actually asks, drafted on open.
   *
   * The run names each textarea and its key, so the card is the form's own
   * wording rather than a guess, and an answer goes back under the key the form
   * reads. `allowModel:false` is instant: it either drafts from the folder or
   * refuses, and the model stays a deliberate second click.
   */
  useEffect(() => {
    // Every form's paragraph questions, not just the one on screen: a refused
    // question about the company has to be visible from the folder view,
    // because it is one of the things the whole app cannot answer.
    for (const [formId, res] of Object.entries(runs)) {
      if (!res) continue;
      for (const r of res.run.fields) {
        if (r.field.type !== "textarea") continue;
        const slot = r.field.id;
        const existing = essays[formId]?.find((c) => c.slot === slot);
        if (existing) {
          if (!existing.key) {
            setEssays((prev) => ({
              ...prev,
              [formId]: (prev[formId] ?? []).map((c) => (c.slot === slot ? { ...c, key: r.field.key } : c)),
            }));
          }
          continue;
        }
        void askEssay(formId, slot, r.field.label, false, r.field.key);
      }
    }
    // `essays` is intentionally not a dependency: each slot is created once and
    // the loop skips what exists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs]);

  // --- the browser ----------------------------------------------------------
  const activeForm = useMemo(
    () => (route.kind === "form" ? state?.forms.find((f) => f.id === route.formId) : undefined),
    [route, state],
  );

  const portalStart = useCallback(async (): Promise<void> => {
    if (!activeForm) return;
    setBrowserBusy(true);
    setBrowserError(null);
    try {
      const r = await postJson<PortalResponse>("/api/portal/start", { formId: activeForm.id, months });
      if (r.error) setBrowserError(r.error);
      setBrowser({ response: r });
    } catch (e) {
      setBrowserError(messageOf(e));
    } finally {
      setBrowserBusy(false);
    }
  }, [activeForm, months]);

  const portalRefill = useCallback(async (): Promise<void> => {
    const id = browser?.response.id;
    if (!activeForm || !id) return;
    setBrowserBusy(true);
    setBrowserError(null);
    try {
      const r = await postJson<PortalResponse>(`/api/portal/refill/${id}`, {
        formId: activeForm.id,
        months,
      });
      setBrowser({ response: { ...r, url: r.url ?? browser?.response.url ?? "" } });
    } catch (e) {
      setBrowserError(messageOf(e));
    } finally {
      setBrowserBusy(false);
    }
  }, [activeForm, browser, months]);

  const portalClose = useCallback(async (): Promise<void> => {
    const id = browser?.response.id;
    if (!id) return;
    try {
      await postJson(`/api/portal/close/${id}`, {});
      setBrowser(null);
      toast("Browser closed. Nothing was sent anywhere.");
    } catch (e) {
      setBrowserError(messageOf(e));
    }
  }, [browser, toast]);

  const doFill = useCallback(async (): Promise<void> => {
    if (!activeForm) return;
    setFillBusy(true);
    setFillError(null);
    try {
      const r = await postJson<FillResponse>(`/api/fill/${activeForm.id}`, {});
      setFill((prev) => ({ ...prev, [activeForm.id]: r }));
      toast("Filled copy written. Nothing was sent.");
    } catch (e) {
      setFillError(messageOf(e));
    } finally {
      setFillBusy(false);
    }
  }, [activeForm, toast]);

  // --- needs you ------------------------------------------------------------
  const fallbackKey = useMemo(() => state?.keys["context"] ?? "person.context", [state]);

  const needs = useMemo<NeedItem[]>(() => {
    if (!state) return [];
    const items: NeedItem[] = [];
    // An answer is against a key, not a form, so the same gap on two forms is
    // one thing to do, not two.
    const seen = new Set<string>();
    for (const f of state.forms) {
      const res = runs[f.id];
      if (!res) continue;
      for (const r of res.run.askList) {
        // A paragraph is a card of its own, with its own refusal. Listing it
        // twice would make the panel look busier than the form is.
        if (r.field.type === "textarea") continue;
        if (seen.has(r.field.key)) continue;
        seen.add(r.field.key);
        items.push({
          id: `${f.id}::${r.field.id}`,
          formId: f.id,
          formTitle: res.run.formTitle,
          label: r.field.label,
          reason: r.reason,
          verdict: r.verdict,
          key: r.field.key,
          candidates: r.candidates,
        });
      }
    }
    for (const [formId, cards] of Object.entries(essays)) {
      const title = state.forms.find((f) => f.id === formId)?.title ?? formId;
      for (const card of cards) {
        // A refused paragraph you have since answered is not still refused.
        const field = runs[formId]?.run.fields.find((r) => r.field.id === card.slot);
        if (field?.verdict === "FILLED") continue;
        if (card.view?.draft.refused) {
          const key = card.key ?? fallbackKey;
          if (seen.has(key)) continue;
          seen.add(key);
          items.push({
            id: `${formId}::essay::${card.slot}`,
            formId,
            formTitle: title,
            label: card.question,
            reason: card.view.draft.refused,
            verdict: "ESSAY",
            key,
          });
        }
      }
    }
    return items;
  }, [state, runs, essays, fallbackKey]);

  const openCounts = useMemo(() => {
    const map: Record<string, number | undefined> = {};
    for (const f of state?.forms ?? []) {
      map[f.id] = runs[f.id]?.run.askList.filter((r) => r.field.type !== "textarea").length;
    }
    return map;
  }, [state, runs]);

  const goOverview = (): void => {
    window.location.hash = "";
    setRoute({ kind: "overview" });
  };
  const goForm = (id: string): void => {
    window.location.hash = id;
    setRoute({ kind: "form", formId: id });
  };

  let body: ReactNode;
  if (status === "loading") {
    body = <Skeleton />;
  } else if (status === "down") {
    body = <ApiBanner onRetry={() => void load()} />;
  } else if (route.kind === "overview" && state) {
    body = (
      <Overview
        state={state}
        needs={needs}
        onUploaded={() => {
          void refresh();
          toast("The folder was re-read.");
        }}
        onContextSaved={() => refresh()}
        onAnswer={answer}
        onToast={toast}
      />
    );
  } else if (route.kind === "form" && state && activeForm) {
    body = runs[activeForm.id] ? (
      <FormView
        form={activeForm}
        res={runs[activeForm.id]!}
        months={months}
        onMonths={setMonths}
        onShow={setDrawer}
        onAnswer={answer}
        canUndo={changes > 0}
        onUndo={() => void undo()}
        essays={essays[activeForm.id] ?? []}
        onEssayQuestion={(slot, q) => void askEssay(activeForm.id, slot, q, false)}
        onEssayModel={(slot, q) => void askEssay(activeForm.id, slot, q, true)}
        answerFallbackKey={fallbackKey}
        browser={browser}
        browserBusy={browserBusy}
        browserError={browserError}
        onPortal={() => void portalStart()}
        onRefill={() => void portalRefill()}
        onBrowserClose={() => void portalClose()}
        fillBusy={fillBusy}
        fill={fill[activeForm.id] ?? null}
        fillError={fillError}
        onFill={() => void doFill()}
      />
    ) : (
      <Skeleton />
    );
  } else {
    body = <Skeleton />;
  }

  const title =
    route.kind === "form" ? (activeForm?.title ?? route.formId) : "Your folder";

  return (
    <div className="shell">
      <Sidebar
        forms={state?.forms ?? []}
        openCounts={openCounts}
        activeFormId={route.kind === "form" ? route.formId : null}
        counters={
          state ? { documents: state.counters.documents, facts: state.counters.facts, readable: state.counters.readable } : null
        }
        journal={state ? { head: state.journal.head, ok: state.journal.verified.ok, entries: state.journal.entries } : null}
        serverUp={status === "ready"}
        onOverview={goOverview}
        onForm={goForm}
      />
      <div className="main">
        <TopBar
          title={title}
          readAt={state?.readAt}
          busy={browserBusy || fillBusy}
          onRefresh={() => void refresh().catch(() => undefined)}
        />
        <main className="content">{body}</main>
      </div>
      <ProvenanceDrawer result={drawer} onClose={() => setDrawer(null)} />
      <Toasts items={toasts} />
    </div>
  );
}

type EssayStore = Record<string, EssayCardState[]>;

function updateCard(
  setEssays: (fn: (prev: EssayStore) => EssayStore) => void,
  formId: string,
  slot: string,
  fix: (c: EssayCardState | undefined) => EssayCardState,
): void {
  setEssays((prev) => {
    const list = [...(prev[formId] ?? [])];
    const idx = list.findIndex((c) => c.slot === slot);
    const made = fix(idx >= 0 ? list[idx] : undefined);
    if (idx >= 0) list[idx] = made;
    else list.push(made);
    return { ...prev, [formId]: list };
  });
}
