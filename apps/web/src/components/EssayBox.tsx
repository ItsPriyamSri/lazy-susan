import { useMemo, useState } from "react";
import type { EssayDraft } from "@lazy-susan/core";

interface Props {
  question: string;
  draft: EssayDraft;
  maxWords: number;
  source: string;
  annotate: (text: string) => EssayDraft;
}

const chip = (key: string): string => key.split(".").slice(-1)[0]!.replace(/_/g, " ");

export function EssayBox({ question, draft, maxWords, source, annotate }: Props): JSX.Element {
  const [typed, setTyped] = useState("");

  const view = useMemo(() => (typed.trim() ? annotate(typed) : draft), [typed, draft, annotate]);

  return (
    <section className="essay">
      <h2>The paragraph</h2>
      <p className="q">{question}</p>

      {view.refused ? (
        <div className="empty">{view.refused}</div>
      ) : (
        <div className="draft">
          {view.accepted.map((s, i) => (
            <span className="sent" key={i}>
              {s.text}
              {s.usedKeys.map((k) => (
                <span className="sent-chip" key={k}>
                  {chip(k)}
                </span>
              ))}
            </span>
          ))}
        </div>
      )}

      {view.struck.length > 0 && (
        <div className="struck">
          {view.struck.map((s, i) => (
            <div className="row" key={i}>
              <s>{s.text}</s>
              <span className="why">{s.reason}</span>
            </div>
          ))}
        </div>
      )}

      <textarea
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder="Type your own version here. The same check runs on every sentence, including the numbers."
        aria-label="Your answer"
      />

      <div className="foot">
        <span>
          {view.wordCount} / {maxWords} words · {view.accepted.length} sentence
          {view.accepted.length === 1 ? "" : "s"} can be traced, {view.struck.length} cannot
        </span>
        <span>
          {typed.trim() ? "your words" : source === "model" ? "drafted by the local model, checked by code" : "assembled from facts"}
        </span>
      </div>
    </section>
  );
}
