import type { FieldResult, Source } from "../lib/types";
import { dateWords } from "../lib/util";
import { StatusPill } from "./StatusPill";
import { Drawer } from "./Drawer";
import { Proof } from "./Proof";

/**
 * Where a value came from, with the evidence next to it. The drawer holds the
 * claimed pointer (file, page/line, confidence) and the proof panel holds the
 * actual page or lines, so the claim can be checked against its own source.
 */
export function ProvenanceDrawer(props: {
  result: FieldResult | null;
  onClose: () => void;
}): JSX.Element | null {
  // Nothing to show is not an empty drawer over the whole page.
  if (!props.result) return null;
  return (
    <Drawer title="Where this came from" onClose={props.onClose}>
      <SourceDetail result={props.result} />
    </Drawer>
  );
}

function SourceDetail(props: { result: FieldResult }): JSX.Element {
  const r = props.result;
  const s = r.source;
  return (
    <div className="src-detail">
      <div className="src-head">
        <StatusPill verdict={r.verdict} />
        <div className="src-value">{r.value ?? "—"}</div>
        <div className="src-reason">{r.reason}</div>
      </div>

      {!s && <p className="muted">This verdict has no pointer. Nothing was read anywhere for it.</p>}

      {s?.kind === "attested" && <AttestedDetail source={s} />}
      {s?.kind === "document" && <DocumentDetail source={s} />}
    </div>
  );
}

function AttestedDetail(props: { source: Extract<Source, { kind: "attested" }> }): JSX.Element {
  const s = props.source;
  return (
    <div className="src-attest">
      <p>
        You typed this on {dateWords(s.at)} ({s.by.replace("+", " + ")}) for{" "}
        <span className="mono">{s.formId}</span>.
      </p>
      {s.resolvedAgainst && (
        <p className="src-against">
          Chosen over <span className="mono">{s.resolvedAgainst}</span>, the value the other side of
          the disagreement pointed at.
        </p>
      )}
      <p className="muted">
        There is no page behind a typed answer. The record is the fact that you wrote it.
      </p>
    </div>
  );
}

function DocumentDetail(props: { source: Extract<Source, { kind: "document" }> }): JSX.Element {
  const s = props.source;
  return (
    <div className="src-doc">
      <dl className="src-facts">
        <div>
          <dt>file</dt>
          <dd className="mono">{s.file}</dd>
        </div>
        {s.line ? (
          <div>
            <dt>line</dt>
            <dd className="mono">{s.line}</dd>
          </div>
        ) : (
          <div>
            <dt>page</dt>
            <dd className="mono">{s.page === 0 ? 1 : s.page}</dd>
          </div>
        )}
        {s.bbox && s.bbox.w < 1 && s.bbox.h < 1 && (
          <div>
            <dt>rectangle</dt>
            <dd className="mono">
              {Math.round(s.bbox.x * 100)}, {Math.round(s.bbox.y * 100)} ·{" "}
              {Math.round(s.bbox.w * 100)}×{Math.round(s.bbox.h * 100)}
            </dd>
          </div>
        )}
        <div>
          <dt>confidence</dt>
          <dd className="mono">{Math.round(s.confidence * 100)}%</dd>
        </div>
      </dl>
      {s.excerpt && <blockquote className="src-excerpt">{s.excerpt}</blockquote>}
      <Proof source={s} />
    </div>
  );
}
