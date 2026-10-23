import { useState } from "react";
import type { FieldResult } from "../lib/types";
import { Icon } from "./Icons";
import { ProvenanceCell } from "./ProvenanceCell";
import { StatusPill } from "./StatusPill";

interface AnswerFn {
  (formId: string, key: string, value: string, against?: string): Promise<string | null>;
}

/**
 * One field of a form: the label it uses, the value the folder could prove (or
 * a dash), the verdict, and the pointer. A field that needs a person is amber
 * and unfolds to be answered in place.
 */
export function FieldRow(props: { formId: string; result: FieldResult; onShow: (r: FieldResult) => void; onAnswer: AnswerFn }): JSX.Element {
  const r = props.result;
  const filled = r.verdict === "FILLED";
  const showable = Boolean(r.source && r.source.kind === "document");
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (): Promise<void> => {
    const value = answer.trim();
    if (!value) return;
    setSaving(true);
    setError(null);
    // A conflict is not answered, it is resolved: one value wins, one yields.
    const chosen = r.candidates?.find((c) => c.value === value);
    const other = r.candidates?.find((c) => c !== chosen);
    const against = r.verdict === "CONFLICT" ? other?.file : undefined;
    const err = await props.onAnswer(props.formId, r.field.key, value, against);
    setSaving(false);
    if (err) setError(err);
    else {
      setAnswer("");
      setOpen(false);
    }
  };

  const canSaveNow = answer.trim().length > 0 && !saving;

  return (
    <li className={`field-row${filled ? "" : " field-row-ask"}`}>
      <div className="field-main">
        <div className="field-label" title={`key: ${r.field.key}`}>
          {r.field.label}
          {!r.field.required && <span className="field-optional">optional</span>}
          {r.field.type === "file" && r.field.accept && (
            <span className="field-optional">wants: {r.field.accept.replace("_", " ")}</span>
          )}
        </div>
        <div className="field-value" title={filled ? r.value ?? "" : undefined}>
          {filled ? r.value : "—"}
        </div>
        <div className="field-pill">
          <StatusPill verdict={r.verdict} source={r.source} />
        </div>
        <div className="field-prov">
          <ProvenanceCell source={r.source} />
          {showable && (
            <button
              type="button"
              className="icon-btn"
              onClick={() => props.onShow(r)}
              aria-label={`Show me the proof for ${r.field.label}`}
              title="Show me"
            >
              <Icon name="eye" />
            </button>
          )}
        </div>
        {!filled && (
          <button
            type="button"
            className="icon-btn field-expand"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={`${open ? "Close" : "Answer"} ${r.field.label}`}
          >
            <span className={`chev${open ? " chev-open" : ""}`}>
              <Icon name="chevron" />
            </span>
          </button>
        )}
      </div>

      {open && !filled && (
        <div className="field-answer">
          <p className="field-reason">{r.reason}</p>
          {r.candidates && r.candidates.length > 0 && (
            <div className="field-candidates">
              <span className="label-caps">pick one</span>
              {r.candidates.map((c, i) => (
                <button type="button" key={i} className="btn btn-chip" onClick={() => setAnswer(c.value)}>
                  {c.value}
                  <span className="chip-why">{c.file.replace(/\.pdf$/, "")}</span>
                </button>
              ))}
            </div>
          )}
          <div className="field-compose">
            <input
              type={r.field.type === "date" ? "date" : "text"}
              className="input"
              value={answer}
              placeholder={`Your ${r.field.label.toLowerCase()}`}
              onChange={(e) => setAnswer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSaveNow) void save();
              }}
              aria-label={`Your answer for ${r.field.label}`}
            />
            <button type="button" className="btn btn-primary" disabled={!canSaveNow} onClick={() => void save()}>
              {saving ? "Recording…" : r.verdict === "CONFLICT" ? "Record your choice" : "Record answer"}
            </button>
          </div>
          {error && <p className="field-error">{error}</p>}
        </div>
      )}
    </li>
  );
}
