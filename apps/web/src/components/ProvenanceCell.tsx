import type { Source } from "../lib/types";
import { provenanceLabel } from "../lib/util";

/**
 * The provenance cell: "resume.docx, line 2" or "passport.pdf, p.1" or
 * "your answer". A dash when there is nothing and no pretence beyond it.
 */
export function ProvenanceCell(props: { source?: Source | undefined }): JSX.Element {
  const label = provenanceLabel(props.source);
  if (!label) return <span className="prov-none">—</span>;
  const attested = props.source?.kind === "attested";
  return <span className={`prov${attested ? " prov-attested" : ""}`}>{label}</span>;
}
