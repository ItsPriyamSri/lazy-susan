import { useState } from "react";
import type { EssayResponse } from "../lib/types";
import { Icon } from "./Icons";

export interface EssayCardState {
  /** What the reader asked for; stable across drafts. */
  slot: string;
  /** The question, as the server's own wording says it. */
  question: string;
  /** The essay slot's key, when the server has named it (portal outcomes do). */
  key?: string;
  /** The checked draft, when one exists. */
  view?: EssayResponse;
  /** A request in flight: instant for templates, a minute for the model. */
  loading?: boolean;
  modelNote?: boolean;
  error?: string;
}

interface AnswerFn {
  (formId: string, key: string, value: string, against?: string): Promise<string | null>;
}

/**
 * One paragraph question, given the same treatment as every other field: a
 * draft that is either fully traced or struck, and refusals that stay refusals.
 */
export function EssayCard(props: {
  formId: string;
  card: EssayCardState;
  /** The value on record for this question, if you have answered it. */
  saved?: string | undefined;
  answerKeyFallback: string;
  onModel: () => void;
  onDraft: () => void;
  onAnswer: AnswerFn;
}): JSX.Element {
  const r = props.card.view;
  const savedWords = props.saved ? props.saved.trim().split(/\s+/).filter(Boolean).length : 0;
  const refused = r?.draft.refused !== undefined && !props.saved;
  const words = props.saved ? savedWords : (r?.draft.wordCount ?? 0);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (): Promise<void> => {
    const value = text.trim();
    if (!value) return;
    setSaving(true);
    setError(null);
    const key = props.card.key ?? props.answerKeyFallback;
    const err = await props.onAnswer(props.formId, key, value);
    setSaving(false);
    if (err) setError(err);
    else {
      setText("");
      setError(null);
    }
  };

  return (
    <section className={`card essay${refused ? " essay-refused" : ""}`} aria-label={props.card.question}>
      <header className="essay-head">
        <h3 className="essay-question">{props.card.question || props.card.slot}</h3>
        {(props.saved || props.card.view) && (
          <span className="essay-count">
            {words} word{words === 1 ? "" : "s"}
          </span>
        )}
      </header>

      {props.card.error && <p className="field-error">{props.card.error}</p>}

      {props.saved && (
        <div className="essay-saved">
          <span className="label-caps">on record</span>
          <p className="essay-draft">{props.saved}</p>
        </div>
      )}

      {!props.saved && !props.card.view && !props.card.loading && (
        <button type="button" className="btn btn-quiet" onClick={props.onDraft}>
          <Icon name="pen" />
          Get a drafted paragraph
        </button>
      )}

      {!props.saved && props.card.loading && <p className="essay-loading">Getting a draft you can check…</p>}

      {!props.saved && props.card.view && !refused && (
        <>
          <p className="essay-draft">
            {props.card.view.draft.accepted.map((s, i) => (
              <span key={`a${i}`} className="essay-sentence">
                {s.text}{" "}
                {s.usedKeys.length > 0 && (
                  <span className="essay-keys">
                    {s.usedKeys.map((k) => (
                      <span key={k} className="chip-key mono">
                        {k}
                      </span>
                    ))}
                  </span>
                )}
              </span>
            ))}
          </p>
          {props.card.view.draft.struck.length > 0 && (
            <div className="essay-struck-box">
              <span className="label-caps label-amber">struck — shown, not quietly deleted</span>
              <ul className="essay-sentences">
                {props.card.view.draft.struck.map((s, i) => (
                  <li key={`s${i}`} className="essay-sentence essay-struck">
                    {s.text}
                    <span className="essay-why">{s.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {props.card.view.source === "model" && props.card.view.ms !== undefined && (
            <p className="essay-footnote">drafted by the local model in {Math.round(props.card.view.ms / 1000)}s, then checked</p>
          )}
          {props.card.view.source === "templates" && (
            <p className="essay-footnote">drafted from your folder's own sentences</p>
          )}
          <button type="button" className="btn btn-quiet" onClick={props.onModel} disabled={props.card.loading}>
            <Icon name="pen" />
            Draft with the local model
          </button>
          {props.card.modelNote && props.card.loading && (
            <span className="essay-warn">may take a minute on this machine</span>
          )}
        </>
      )}

      {!props.saved && props.card.view && refused && (
        <div className="essay-refusal">
          <p className="essay-refuse-title">This one is yours.</p>
          <p className="essay-refuse-why">{props.card.view.draft.refused}</p>
          <textarea
            className="input essay-input"
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Your words. Nothing is counted as a document here."
            aria-label={`Your answer to ${props.card.question}`}
          />
          <div className="essay-actions">
            <button
              type="button"
              className="btn btn-amber"
              disabled={!text.trim() || saving}
              onClick={() => void save()}
            >
              {saving ? "Recording…" : "Save my answer"}
            </button>
            <button type="button" className="btn btn-quiet" onClick={props.onModel} disabled={props.card.loading}>
              <Icon name="pen" />
              Draft with the local model
            </button>
            {props.card.modelNote && props.card.loading && (
              <span className="essay-warn">may take a minute on this machine</span>
            )}
          </div>
          {error && <p className="field-error">{error}</p>}
        </div>
      )}
    </section>
  );
}
