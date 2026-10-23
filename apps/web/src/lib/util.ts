import type { Source, Verdict } from "./types";

/** All presentation decisions around values/docs live here, so the components stay dumb. */

export function shortHash(hash: string): string {
  return hash.replace(/^sha256:/, "").slice(0, 8);
}

/** "13:05" from an ISO timestamp, in the viewer's own clock. */
export function timeHHMM(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function dateWords(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

export function percent(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The provenance cell: "resume.docx, line 2" / "passport.pdf, p.1" / "your answer". */
export function provenanceLabel(source?: Source): string {
  if (!source) return "";
  if (source.kind === "attested") return "your answer";
  const parts = [source.file];
  const fullPage = source.bbox && source.bbox.w === 1 && source.bbox.h === 1;
  if (source.line) parts.push(`line ${source.line}`);
  else if (!fullPage) parts.push(`p.${source.page + 1}`);
  return parts.join(", ");
}

/** Which page to ask the brain to render. The server clamps to at least 1. */
export function proofPage(source: Extract<Source, { kind: "document" }>): number {
  return Math.max(1, source.page === 0 ? 1 : source.page);
}

export const VERDICT_META: Record<Verdict, { label: string; title: string }> = {
  FILLED: { label: "filled", title: "Filled from your folder" },
  ASKED: { label: "needs you", title: "Nothing in the folder carries this" },
  CONFLICT: { label: "conflict", title: "Two documents disagree" },
  EXPIRED: { label: "expired", title: "The proof is too old for the current rule" },
  UNREADABLE: { label: "unreadable", title: "Could not be read with enough confidence" },
};


