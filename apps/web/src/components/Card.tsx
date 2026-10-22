import { useState } from "react";
import type { BBox, FieldResult } from "@lazy-susan/core";

export interface PeekTarget {
  file: string;
  page: number;
  bbox: BBox;
  value: string;
}

interface Props {
  result: FieldResult;
  onAnswer: (key: string, value: string) => void;
  onResolve: (key: string, value: string, against: string) => void;
  onPeek: (target: PeekTarget) => void;
}

export function Card({ result, onAnswer, onResolve, onPeek }: Props): JSX.Element {
  const { field, verdict, value, reason, weak, source, candidates } = result;
  const [draft, setDraft] = useState("");
  const [typed, setTyped] = useState(false);

  const peekable = source?.kind === "document";

  const submit = (): void => {
    const v = draft.trim();
    if (!v) return;
    onAnswer(field.key, v);
    setDraft("");
    setTyped(false);
  };

  return (
    <article className={`card ${verdict.toLowerCase()}`}>
      <div className="card-bar" aria-hidden />
      <div className="card-body">
        <div className="card-top">
          <span className={`pill ${verdict.toLowerCase()}`}>{verdict}</span>
          {weak && <span className="pill attested">your word</span>}
          <span className="label">{field.label}</span>
        </div>

        {verdict === "FILLED" && <div className={`value ${weak ? "weak" : ""}`}>{value}</div>}
        {verdict === "EXPIRED" && value && <div className="value weak">{value}</div>}

        {verdict === "CONFLICT" && candidates && (
          <div className="choices">
            {candidates.map((c) => (
              <button key={c.value} className="choice" onClick={() => onResolve(field.key, c.value, c.file)}>
                <span className="cval">{c.value}</span>
                <span className="cfile">
                  {c.file}
                  {c.issued ? ` · ${c.issued}` : ""}
                </span>
              </button>
            ))}
          </div>
        )}

        {(verdict === "ASKED" || verdict === "UNREADABLE" || verdict === "EXPIRED") && (
          <>
            {!typed && verdict !== "ASKED" && (
              <div className="answer">
                <button className="btn" onClick={() => setTyped(true)}>
                  {verdict === "EXPIRED" && value ? "Use it anyway" : "Type it in"}
                </button>
              </div>
            )}
            {(typed || verdict === "ASKED") && (
              <div className="answer">
                <input
                  type="text"
                  value={draft}
                  placeholder={verdict === "EXPIRED" && value ? value : `Your ${field.label.toLowerCase()}`}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  aria-label={field.label}
                />
                <button className="btn primary" onClick={submit} disabled={!draft.trim()}>
                  Save
                </button>
              </div>
            )}
          </>
        )}

        <p className="reason">{reason}</p>
      </div>

      <div className="card-actions">
        {peekable && source.kind === "document" && (
          <button
            className="btn small"
            onClick={() => onPeek({ file: source.file, page: source.page, bbox: source.bbox, value: value ?? "" })}
          >
            Show me
          </button>
        )}
      </div>
    </article>
  );
}
