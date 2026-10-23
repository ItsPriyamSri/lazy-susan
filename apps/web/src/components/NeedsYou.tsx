import { useState } from "react";
import { api, getJson } from "../lib/api";
import type { BriefResponse, Candidate, Verdict } from "../lib/types";
import { Icon } from "./Icons";

export interface NeedItem {
  /** Stable per instance: `${formId}::${key}` or `${formId}::essay::${question}` */
  id: string;
  formId: string;
  formTitle: string;
  label: string;
  reason: string;
  verdict: Verdict | "ESSAY";
  key: string;
  candidates?: Candidate[];
}

interface AnswerFn {
  (formId: string, key: string, value: string, against?: string): Promise<string | null>;
}

/**
 * Everything the folder cannot prove, in one amber panel. Each line says which
 * form, what it asked, why the app stopped, and gives you a box to finish it.
 */
export function NeedsYou(props: {
  items: NeedItem[];
  briefFormId: string | "all";
  onAnswer: AnswerFn;
  onToast: (text: string) => void;
}): JSX.Element {
  const hasItems = props.items.length > 0;

  return (
    <section className="card needs" aria-label="Needs you">
      <header className="needs-head">
        <div>
          <h3 className="needs-title">Needs you</h3>
          {hasItems ? (
            <p className="needs-sub">{props.items.length} things only you can answer.</p>
          ) : (
            <p className="needs-sub">Nothing needs you. That is the whole point.</p>
          )}
        </div>
        {hasItems && <BriefButton formId={props.briefFormId} onToast={props.onToast} />}
      </header>

      <ul className="needs-list">
        {props.items.map((it) => (
          <NeedRow key={it.id} item={it} onAnswer={props.onAnswer} onToast={props.onToast} />
        ))}
      </ul>
    </section>
  );
}

function NeedRow(props: { item: NeedItem; onAnswer: AnswerFn; onToast?: ((text: string) => void) | undefined }): JSX.Element {
  const it = props.item;
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (value: string): Promise<void> => {
    if (!value.trim()) return;
    setSaving(true);
    setError(null);
    const chosen = it.candidates?.find((c) => c.value === value.trim());
    const other = it.candidates?.find((c) => c !== chosen);
    const err = await props.onAnswer(
      it.formId,
      it.key,
      value.trim(),
      it.verdict === "CONFLICT" ? other?.file : undefined,
    );
    setSaving(false);
    if (err) setError(err);
    else {
      setText("");
      props.onToast?.(`Recorded for ${it.formTitle}.`);
    }
  };

  return (
    <li className="need-row">
      <div className="need-text">
        <span className="need-label">{it.label}</span>
        <span className="need-form mono">{it.formTitle}</span>
      </div>
      <p className="need-reason">{it.reason}</p>

      {it.candidates && it.candidates.length > 0 && (
        <div className="need-candidates">
          {it.candidates.map((c, i) => (
            <button
              type="button"
              key={i}
              className="btn btn-chip"
              onClick={() => setText(c.value)}
              title={`${c.file}${c.issued ? `, issued ${c.issued}` : ""}`}
            >
              {c.value}
              <span className="chip-why">{c.file.replace(/\.pdf$/, "")}</span>
            </button>
          ))}
        </div>
      )}

      <div className="need-compose">
        {it.verdict === "ESSAY" ? (
          <textarea
            className="input"
            rows={3}
            value={text}
            placeholder="Your answer, in your words"
            onChange={(e) => setText(e.target.value)}
            aria-label={`Your answer for ${it.label} on ${it.formTitle}`}
          />
        ) : (
          <input
            type="text"
            className="input"
            value={text}
            placeholder="Your answer"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save(text);
            }}
            aria-label={`Your answer for ${it.label} on ${it.formTitle}`}
          />
        )}
        <button type="button" className="btn btn-amber" disabled={!text.trim() || saving} onClick={() => void save(text)}>
          {saving ? "Recording…" : "Record"}
        </button>
      </div>
      {error && <p className="field-error">{error}</p>}
    </li>
  );
}

/** ElevenLabs when there is a key; the script itself when there is not. */
function BriefButton(props: { formId: string | "all"; onToast: (text: string) => void }): JSX.Element {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [script, setScript] = useState("");
  const [audio, setAudio] = useState<string | null>(null);

  const start = async (): Promise<void> => {
    setState("loading");
    try {
      const res = await api(`/api/brief/${props.formId}`);
      if (res.ok) {
        if ((res.headers.get("content-type") ?? "").startsWith("audio")) {
          const url = URL.createObjectURL(await res.blob());
          setAudio(url);
          setScript("");
          await new Audio(url).play();
        } else {
          const body = (await res.json()) as BriefResponse;
          setScript(body.script);
          setAudio(null);
        }
      }
      // Not ok, or no key: the button dulls out and the list stays on screen.
      setState("done");
    } catch {
      setState("done");
    }
  };

  return (
    <div className="brief">
      <button type="button" className="btn btn-quiet" onClick={() => void start()} disabled={state === "loading"}>
        <Icon name="mic" />
        {state === "loading" ? "Reading…" : "Read the list"}
      </button>
      {audio && (
        <audio controls src={audio} className="brief-audio" aria-label="The spoken list">
          <track kind="captions" />
        </audio>
      )}
      {script && <p className="brief-script">"{script}"</p>}
    </div>
  );
}
