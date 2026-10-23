import type { Source, Verdict } from "../lib/types";
import { VERDICT_META, percent } from "../lib/util";

/**
 * One pill: the verdict. Green only for filled, amber for anything waiting on
 * you, red for a disagreement, grey when nothing was ever ours to read.
 * Confidence trails along when a document claims the value.
 */
export function StatusPill(props: { verdict: Verdict; source?: Source | undefined }): JSX.Element {
  const meta = VERDICT_META[props.verdict];
  const cls =
    props.verdict === "FILLED"
      ? "pill pill-ok"
      : props.verdict === "ASKED" || props.verdict === "EXPIRED"
        ? "pill pill-amber"
        : props.verdict === "CONFLICT"
          ? "pill pill-red"
          : "pill";
  const conf =
    props.source?.kind === "document" && props.verdict !== "UNREADABLE"
      ? ` · ${percent(props.source.confidence)}`
      : "";
  return (
    <span className={cls} title={`${meta.title}${conf}`}>
      {meta.label}
      {conf && <span className="pill-detail">{conf}</span>}
    </span>
  );
}
