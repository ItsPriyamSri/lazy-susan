import { useCallback, useEffect, useMemo, useState } from "react";
import { annotateEssay, attributeFacts, planFill, runForm } from "@lazy-susan/core";
import type { EssayDraft, FieldResult } from "@lazy-susan/core";
import replayJson from "./data/replay.json";
import type { ReplayData } from "./lib/types";
import { buildIndex, humanDate, journalFor, rulesWith, type Answer } from "./lib/engine";
import { Card, type PeekTarget } from "./components/Card";
import { Peek } from "./components/Peek";
import { EssayBox } from "./components/EssayBox";

const data = replayJson as unknown as ReplayData;
const TABS = data.forms.map((f) => f.spec.id);

const SHORT: Record<string, string> = {
  "bank-account": "Bank",
  enrolment: "Enrolment",
  scholarship: "Scholarship",
};
const shortName = (id: string): string => SHORT[id] ?? id;

const fromHash = (): string => {
  const h = typeof location !== "undefined" ? location.hash.replace("#", "") : "";
  return TABS.includes(h) ? h : TABS[0] ?? "bank-account";
};

export default function App(): JSX.Element {
  const [formId, setFormId] = useState(fromHash);
  const [months, setMonths] = useState(3);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [peek, setPeek] = useState<PeekTarget | null>(null);
  const [live, setLive] = useState(false);
  const [filling, setFilling] = useState(false);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => (r.ok ? setLive(true) : setLive(false)))
      .catch(() => setLive(false));
  }, []);

  const index = useMemo(() => buildIndex(data, answers), [answers]);
  const journal = useMemo(() => journalFor(data, answers), [answers]);
  const verified = useMemo(() => journal.verify(), [journal]);
  const hash = index.hash();

  const form = useMemo(() => data.forms.find((f) => f.spec.id === formId)?.spec ?? data.forms[0]!.spec, [formId]);
  const rules = useMemo(() => rulesWith(months), [months]);
  const run = useMemo(() => runForm(form, index, rules, data.readAt), [form, index, rules]);
  const plan = useMemo(() => planFill(run), [run]);

  const counts = useMemo(
    () =>
      data.forms.map((f) => ({
        id: f.spec.id,
        title: f.spec.title,
        open: runForm(f.spec, index, rules, data.readAt).askList.length,
        total: f.spec.fields.length,
      })),
    [index, rules],
  );

  const answer = useCallback(
    (key: string, value: string) => {
      setAnswers((prev) => [...prev, { key, value, formId, at: new Date().toISOString() }]);
    },
    [formId],
  );

  const resolve = useCallback(
    (key: string, value: string, against: string) => {
      setAnswers((prev) => [...prev, { key, value, formId, against, at: new Date().toISOString() }]);
    },
    [formId],
  );

  const undo = useCallback(() => {
    setAnswers((prev) => (prev.length ? prev.slice(0, -1) : prev));
  }, []);

  const annotate = useCallback(
    (text: string): EssayDraft => {
      const facts = index.facts.map((f) => ({ key: f.key, value: f.value }));
      return annotateEssay(essayQuestion, attributeFacts(text, facts), index, essayWords);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index],
  );

  const essay = data.essays[form.id];
  const essayField = form.fields.find((f) => f.type === "textarea");
  const essayQuestion = essay?.question ?? essayField?.label ?? "Why are you a good fit?";
  const essayWords = essayField?.maxWords ?? 200;

  const open = run.fields.filter((f) => f.verdict !== "FILLED");
  const filled = run.fields.filter((f) => f.verdict === "FILLED");

  return (
    <div className="shell">
      <aside className="rail">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <span className="brand-name">Lazy Susan</span>
        </div>
        <p className="brand-sub">
          It fills what the folder can prove and asks you for the rest. It does not guess.
        </p>

        <h2>The folder</h2>
        <div>
          {data.documents.map((d) => (
            <div key={d.file} className={`rail-doc ${d.readable ? "" : "unreadable"}`}>
              <span className="dot" aria-hidden />
              <div>
                <div>{d.title}</div>
                <div className="meta">
                  {d.file} · {d.facts} fact{d.facts === 1 ? "" : "s"}
                  {d.issued ? ` · ${d.issued}` : ""}
                </div>
                {!d.readable && <div className="unreadable-label">could not be read</div>}
              </div>
            </div>
          ))}
        </div>

        <h2>The night</h2>
        <ul className="rail-list">
          <li>
            <span>Files read</span>
            <span className="n">
              {data.counters.readable}/{data.counters.documents}
            </span>
          </li>
          <li>
            <span>Facts indexed</span>
            <span className="n">{data.counters.facts}</span>
          </li>
          <li>
            <span>Values not found on a page</span>
            <span className="n">{data.counters.unplaced}</span>
          </li>
          <li>
            <span>Read at</span>
            <span className="n">{humanDate(data.readAt).split(",")[0]}</span>
          </li>
        </ul>
      </aside>

      <main className="main">
        <header className="head">
          <div>
            <p className="kicker">Morning list · {counts.find((c) => c.id === form.id)?.open ?? 0} open</p>
            <h1>{form.title}</h1>
            <p className="lede">
              {run.fields.length} fields. {filled.length} filled from {data.counters.documents} files,{" "}
              {open.length} for you{essayField ? ", plus the paragraph at the bottom" : ""}. Nothing here was guessed.
            </p>
          </div>
          <div className="tabs" role="tablist" aria-label="Forms">
            {counts.map((c) => (
              <button
                key={c.id}
                className="tab"
                role="tab"
                aria-selected={c.id === form.id}
                onClick={() => {
                  setFormId(c.id);
                  history.replaceState(null, "", `#${c.id}`);
                }}
              >
                {shortName(c.id)} · {c.open}
              </button>
            ))}
          </div>
        </header>

        <div className="summary">
          <Tally verdict="filled" n={run.counts.FILLED} label="filled" />
          <Tally verdict="asked" n={run.counts.ASKED} label="asked" />
          <Tally verdict="conflict" n={run.counts.CONFLICT} label="conflict" />
          <Tally verdict="expired" n={run.counts.EXPIRED} label="expired" />
          <Tally verdict="unreadable" n={run.counts.UNREADABLE} label="unreadable" />
        </div>

        <div className="section-head">
          <h2>Needs you</h2>
          <p>{open.length === 0 ? "Nothing. The form is ready for a person to sign." : "Answer, choose, or type. Each answer is kept for the next form."}</p>
          {open.length > 0 && <Speak formId={form.id} />}
        </div>

        <div className="cards">
          {open.length === 0 && <div className="empty">Every field is traced to a document or to something you typed.</div>}
          {open.map((r) => (
            <Card key={r.field.id} result={r} onAnswer={answer} onResolve={resolve} onPeek={setPeek} />
          ))}
        </div>

        <div className="section-head">
          <h2>Filled from your folder</h2>
          <p>{filled.length} field{filled.length === 1 ? "" : "s"} · click to see the page</p>
        </div>

        <div className="filled-list">
          {filled.map((r) => (
            <FilledRow key={r.field.id} result={r} onPeek={setPeek} />
          ))}
        </div>

        {essayField && (
          <EssayBox
            question={essayQuestion}
            draft={essay?.draft ?? { question: essayQuestion, accepted: [], struck: [], text: "", wordCount: 0 }}
            maxWords={essayWords}
            source={essay?.source ?? "templates"}
            annotate={annotate}
          />
        )}

        <div className="ledger">
          <div>
            <div className="k">Ledger hash</div>
            <div className="v">{hash.slice(0, 24)}</div>
            <div className="hint">
              {journal.entries.length} journal entries · {verified.ok ? "chain intact" : `broken at ${verified.brokenAt}`}
            </div>
          </div>
          <div>
            <div className="k">Your answers</div>
            <div className="v">{answers.length} kept</div>
            <button className="btn small" style={{ marginTop: 8 }} onClick={undo} disabled={!answers.length}>
              Undo the last one
            </button>
            <div className="hint">Undo replays the journal and should land on the earlier hash exactly.</div>
          </div>
          <div>
            <div className="k">Proof of address</div>
            <div className="slider">
              <input
                type="range"
                min={1}
                max={12}
                step={1}
                value={months}
                onChange={(e) => setMonths(Number(e.target.value))}
                aria-label="Months a proof of address stays usable"
              />
              <output>{months} mo</output>
            </div>
            <div className="hint">Move this and the verdicts change. This is the engine, not a recording.</div>
          </div>
          <div>
            <div className="k">The form</div>
            <div className="v">{plan.blocked.length ? `${plan.blocked.length} required field(s) open` : "ready to sign"}</div>
            {live ? (
              <button
                className="btn small"
                style={{ marginTop: 8 }}
                disabled={filling}
                onClick={async () => {
                  setFilling(true);
                  try {
                    const res = await fetch(`/api/fill/${form.id}?months=${months}`, { method: "POST" });
                    const body = (await res.json()) as { url: string };
                    window.open(body.url, "_blank");
                  } finally {
                    setFilling(false);
                  }
                }}
              >
                {filling ? "Filling…" : "Write the filled file"}
              </button>
            ) : (
              <div className="hint">Filling the file needs the local app. This page is a frozen run.</div>
            )}
          </div>
        </div>

        <p className="footnote">
          Every fact above points at a rectangle on a page, or at a line you typed. The paragraph is drafted by a
          small local model and then checked here, in this browser, one sentence at a time: a number that is not in
          your folder gets struck out. Nothing is sent anywhere.
        </p>
      </main>

      {peek && <Peek target={peek} onClose={() => setPeek(null)} />}
    </div>
  );
}

function Tally({ verdict, n, label }: { verdict: string; n: number; label: string }): JSX.Element {
  return (
    <div className={`tally ${verdict}`}>
      <div className="n">{n}</div>
      <div className="k">{label}</div>
    </div>
  );
}

function Speak({ formId }: { formId: string }): JSX.Element {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");

  async function readAloud() {
    setState("loading");
    try {
      const res = await fetch(`/api/brief/${formId}`);

      // The server answers with audio when it has a voice, and with the script
      // when it does not. Either way the words are the app's own.
      if (res.headers.get("content-type")?.includes("json")) {
        const body = (await res.json()) as { script: string };
        const utterance = new SpeechSynthesisUtterance(body.script);
        utterance.rate = 1.02;
        utterance.onend = () => setState("idle");
        window.speechSynthesis.speak(utterance);
        setState("playing");
        return;
      }

      const audio = new Audio(URL.createObjectURL(await res.blob()));
      audio.onended = () => setState("idle");
      await audio.play();
      setState("playing");
    } catch {
      setState("idle");
    }
  }

  return (
    <button className="ghost" onClick={readAloud} disabled={state !== "idle"}>
      {state === "idle" ? "Read it to me" : state === "loading" ? "Finding a voice…" : "Reading…"}
    </button>
  );
}

function FilledRow({ result, onPeek }: { result: FieldResult; onPeek: (t: PeekTarget) => void }): JSX.Element {
  const { field, value, weak, source } = result;
  return (
    <div className="frow">
      <span className="flabel">{field.label}</span>
      <span className="fvalue">
        {value}
        {weak && <span className="pill attested">your word</span>}
      </span>
      {source?.kind === "document" ? (
        <button
          className="flink"
          onClick={() => onPeek({ file: source.file, page: source.page, bbox: source.bbox, value: value ?? "" })}
        >
          {source.file}
        </button>
      ) : (
        <span className="flink muted">{source?.kind === "attested" ? "your answer" : ""}</span>
      )}
    </div>
  );
}
