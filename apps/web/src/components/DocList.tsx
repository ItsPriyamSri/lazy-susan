import { useState } from "react";
import type { DocumentSummary } from "../lib/types";
import { percent, dateWords } from "../lib/util";
import { Icon } from "./Icons";
import { Proof } from "./Proof";

/**
 * Every file the brain has read, one row each, with the numbers it claims:
 * what kind of document it is, when it was issued, how much of it it could read.
 */
export function DocList(props: { documents: DocumentSummary[] }): JSX.Element {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section className="card docs" aria-label="Documents">
      <h3 className="section-title">Documents</h3>
      <ul className="doc-list">
        {props.documents.map((d) => (
          <li key={d.file} className={`doc-row${d.readable ? "" : " doc-unreadable"}`}>
            <div className="doc-main">
              <button
                type="button"
                className="doc-toggle"
                onClick={() => setOpen(open === d.file ? null : d.file)}
                aria-expanded={open === d.file}
                aria-label={`${open === d.file ? "Hide" : "Show"} ${d.file}`}
              >
                <span className={`chev${open === d.file ? " chev-open" : ""}`}>
                  <Icon name="chevron" />
                </span>
              </button>
              <span className="doc-file mono">{d.file}</span>
              {d.title && d.title !== d.file && <span className="doc-title">{d.title}</span>}
              <span className="doc-kind">{d.kind.replace("_", " ")}</span>
              {d.issued && <span className="doc-issued">{dateWords(d.issued)}</span>}
              <span className="doc-num mono">{d.pages} p</span>
              <span className="doc-num mono">{d.facts} facts</span>
              <span className="doc-num mono" title="the reader's confidence in its own read">
                {percent(d.confidence)}
              </span>
              {!d.readable && <span className="pill">not readable</span>}
            </div>

            {open === d.file && (
              <div className="doc-peek">
                <DocPeek doc={d} />
              </div>
            )}
          </li>
        ))}
      </ul>
      {props.documents.length === 0 && (
        <p className="empty-line">Nothing here yet. Drop a file above and the folder starts.</p>
      )}
    </section>
  );
}

/** The first page or the text itself — whatever the format can show. */
function DocPeek(props: { doc: DocumentSummary }): JSX.Element {
  if (props.doc.file.toLowerCase().endsWith(".pdf")) {
    return <Proof source={{ kind: "document", file: props.doc.file, page: 0, bbox: { x: 0, y: 0, w: 0, h: 0 }, confidence: 1 }} />;
  }
  return <Proof source={{ kind: "document", file: props.doc.file, page: 0, line: 0, bbox: { x: 0, y: 0, w: 0, h: 0 }, confidence: 1 }} />;
}
