import type { FieldResult, FillResponse, FormResponse } from "../lib/types";
import { BrowserPanel, type BrowserView } from "./BrowserPanel";
import { EssayCard, type EssayCardState } from "./EssayCard";
import { FieldRow } from "./FieldRow";
import { Icon } from "./Icons";

interface AnswerFn {
  (formId: string, key: string, value: string, against?: string): Promise<string | null>;
}

export interface FormViewProps {
  form: { id: string; title: string; kind: string; fields: number };
  res: FormResponse;
  months: number;
  onMonths: (m: number) => void;
  onShow: (r: FieldResult) => void;
  onAnswer: AnswerFn;
  canUndo: boolean;
  onUndo: () => void;
  essays: EssayCardState[];
  onEssayQuestion: (slot: string, question: string) => void;
  onEssayModel: (slot: string, question: string) => void;
  answerFallbackKey: string;
  browser: BrowserView | null;
  browserBusy: boolean;
  browserError: string | null;
  onPortal: () => void;
  onRefill: () => void;
  onBrowserClose: () => void;
  fillBusy: boolean;
  fill: FillResponse | null;
  fillError: string | null;
  onFill: () => void;
}

const MONTH_OPTIONS = [1, 3, 6, 12];

/** The one form's whole surface: fields, paragraph drafts, actions, the browser. */
export function FormView(props: FormViewProps): JSX.Element {
  const run = props.res.run;

  const rows = run.fields.filter((r) => r.field.type !== "textarea");
  const filled = rows.filter((r) => r.verdict === "FILLED").length;
  const total = rows.length;

  return (
    <div className="stack">
      <header className="page-head">
        <h1>{run.formTitle}</h1>
        <div className="form-controls">
          <label className="rule-control">
            <span className="rule-label">Address proof accepted within</span>
            <select
              className="rule-select"
              value={props.months}
              onChange={(e) => props.onMonths(Number(e.target.value))}
              aria-label="How old address proof may be, in months"
            >
              {MONTH_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <span className="rule-label">months</span>
          </label>
          <span className="fill-summary mono" title={`run at ${run.at}`}>
            {filled} of {total} filled
          </span>
        </div>
      </header>

      {total === 0 ? (
        <p className="empty-line muted">Nothing asked on this form.</p>
      ) : (
        <ul className="field-list" aria-label="Form fields">
          {rows.map((r) => (
            <FieldRow
              key={r.field.id}
              formId={run.formId}
              result={r}
              onShow={props.onShow}
              onAnswer={props.onAnswer}
            />
          ))}
        </ul>
      )}

      <section className="essay-section" aria-label="Paragraph questions">
        {props.essays.length > 0 ? (
          <>
            <span className="label-caps">Your words</span>
            <p className="essay-lead muted">
              Paragraph questions get traced drafts too: every sentence chips the facts it leans
              on, and anything invented is struck in the open.
            </p>
          {props.essays.map((card) => (
            <EssayCard
              key={card.slot}
              formId={run.formId}
              card={card}
              saved={run.fields.find((r) => r.field.id === card.slot && r.verdict === "FILLED")?.value}
              answerKeyFallback={props.answerFallbackKey}
              onModel={() => props.onEssayModel(card.slot, card.question || card.slot)}
              onDraft={() => props.onEssayQuestion(card.slot, card.question || card.slot)}
              onAnswer={props.onAnswer}
            />
          ))}
          </>
        ) : (
          <span className="label-caps">Your words</span>
        )}
      </section>

      <section className="card actions" aria-label="Form actions">
        <button
          type="button"
          className="btn btn-quiet"
          disabled={!props.canUndo}
          onClick={props.onUndo}
          title="the last thing you recorded, on any form"
        >
          <Icon name="undo" />
          Undo last answer
        </button>
        <button type="button" className="btn btn-primary" onClick={props.onFill} disabled={props.fillBusy}>
          <Icon name="download" />
          {props.form.kind === "pdf" ? "Download filled PDF" : "Download filled copy"}
        </button>
        {props.fillBusy && <span className="essay-warn">writing it…</span>}
      </section>

      {props.fillError && <p className="field-error">{props.fillError}</p>}

      {props.fill && (
        <section className="card fill-result" aria-label="Filled copy">
          <p>
            Written to <span className="mono">{props.fill.file}</span> —{" "}
            <a href={props.fill.url} download target="_blank" rel="noreferrer">
              open the filled {props.fill.kind === "pdf" ? "PDF" : "page"}
            </a>
            . It has not been sent anywhere.
          </p>
          {props.fill.plan?.blocked && props.fill.plan.blocked.length > 0 && (
            <div className="fill-blocked">
              <span className="label-caps label-amber">still needs you before you send</span>
              <ul>
                {props.fill.plan.blocked.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {props.form.kind === "html" && (
        <BrowserPanel
          formId={props.form.id}
          formTitle={props.form.title}
          view={props.browser}
          busy={props.browserBusy}
          error={props.browserError}
          onStart={props.onPortal}
          onRefill={props.onRefill}
          onClose={props.onBrowserClose}
        />
      )}
    </div>
  );
}
