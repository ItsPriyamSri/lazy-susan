import { useEffect, useRef, useState } from "react";
import { getJson } from "../lib/api";
import type { DocumentSource, DocumentTextResponse } from "../lib/types";
import { proofPage } from "../lib/util";

/**
 * The proof panel: the page the value was read from, or the lines. A picture
 * of the page makes the rectangle checkable by eye; that is the whole argument.
 */
export function Proof(props: { source: DocumentSource; maxLines?: number }): JSX.Element {
  const isPdf = /\.pdf$/i.test(props.source.file);
  return (
    <div className="proof">
      {isPdf ? <PdfProof source={props.source} /> : <LinesProof source={props.source} maxLines={props.maxLines} />}
    </div>
  );
}

/** A PDF page with the cited rectangle in amber. */
function PdfProof(props: { source: DocumentSource }): JSX.Element {
  const page = proofPage(props.source);
  const [err, setErr] = useState("");
  useEffect(() => setErr(""), [props.source.file, page]);
  return (
    <figure className="proof-figure">
      {err ? (
        <p className="proof-error">{err}</p>
      ) : (
        <div className="proof-page">
          <img
            src={`/api/page/${props.source.file}/${page}`}
            alt={`Page ${page} of ${props.source.file}`}
            loading="lazy"
            onError={() => setErr(`The brain could not render page ${page} of ${props.source.file}.`)}
          />
          {props.source.bbox && props.source.bbox.w > 0 && props.source.bbox.h > 0 && (
            <div
              className="proof-hl"
              style={{
                left: `${props.source.bbox.x * 100}%`,
                top: `${props.source.bbox.y * 100}%`,
                width: `${props.source.bbox.w * 100}%`,
                height: `${props.source.bbox.h * 100}%`,
              }}
            />
          )}
        </div>
      )}
      <figcaption>
        {props.source.file} · page {page}
      </figcaption>
    </figure>
  );
}

/** Text or DOCX lines, with the cited line called out. */
function LinesProof(props: { source: DocumentSource; maxLines?: number }): JSX.Element {
  const [lines, setLines] = useState<string[] | null>(null);
  const [err, setErr] = useState("");
  const citeRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    let alive = true;
    setLines(null);
    setErr("");
    getJson<DocumentTextResponse>(`/api/document/${props.source.file}`)
      .then((body) => {
        if (alive) setLines(body.lines);
      })
      .catch((e: unknown) => {
        if (alive) setErr(messageOf(e));
      });
    return () => {
      alive = false;
    };
  }, [props.source.file]);

  useEffect(() => {
    // The cited line should reach the reader without a scroll hunt.
    citeRef.current?.scrollIntoView({ block: "center" });
  }, [lines]);

  if (err) return <p className="proof-error">{err}</p>;
  if (lines === null) return <p className="proof-wait">Reading the file…</p>;

  const cite = props.source.line ?? 0;
  const shown = props.maxLines ? lines.slice(0, props.maxLines) : lines;
  return (
    <figure className="proof-figure">
      <ol className="proof-lines">
        {shown.map((line, i) => (
          <li key={i} ref={i + 1 === cite ? citeRef : undefined} className={i + 1 === cite ? "proof-cited" : undefined}>
            <span className="proof-line-no">{i + 1}</span>
            <span className="proof-line-text">{line || " "}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

export function messageOf(err: unknown): string {
  if (err instanceof Error) {
    return /^Network/.test(err.message) || err.message === "Failed to fetch"
      ? "The brain is not reachable."
      : err.message;
  }
  return "Something went wrong.";
}
