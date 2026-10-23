import type { ApiState, DocumentSummary } from "../lib/types";
import { plural } from "../lib/util";
import { ContextCard } from "./ContextCard";
import { DocList } from "./DocList";
import { EmptyFolder } from "./States";
import { NeedsYou, type NeedItem } from "./NeedsYou";
import { UploadZone } from "./UploadZone";

/**
 * The overview: what the folder holds, what got in just now, the paragraph
 * about you, and everything the folder cannot prove on its own.
 */
export function Overview(props: {
  state: ApiState;
  needs: NeedItem[];
  onUploaded: () => void;
  onContextSaved: () => Promise<void>;
  onAnswer: (formId: string, key: string, value: string, against?: string) => Promise<string | null>;
  onToast: (text: string) => void;
}): JSX.Element {
  const c = props.state.counters;
  return (
    <div className="stack">
      <header className="page-head">
        <h1>Your folder</h1>
        <div className="stat-row">
          <Stat n={c.documents} label="files" />
          <Stat n={c.readable} label="readable" />
          <Stat n={c.facts} label="facts" />
          <Stat n={c.unplaced} label="unplaced" hint="read but no slot" />
        </div>
        {c.unplaced > 0 && (
          <p className="stat-note">
            {plural(c.unplaced, "value was", "values were")} read but fits no known slot. They are
            waiting in {props.state.documents.length} files, not lost.
          </p>
        )}
      </header>

      <UploadZone onUploaded={props.onUploaded} />

      <ContextCard
        initial={props.state.context.text}
        savedAt={props.state.context.savedAt}
        onSave={props.onContextSaved}
        onToast={props.onToast}
      />

      <NeedsYou
        items={props.needs}
        briefFormId="all"
        onAnswer={props.onAnswer}
        onToast={props.onToast}
      />

      <DocList documents={props.state.documents as DocumentSummary[]} />

      {props.state.documents.length === 0 && <EmptyFolder />}
    </div>
  );
}

function Stat(props: { n: number; label: string; hint?: string | undefined }): JSX.Element {
  return (
    <div className="stat" title={props.hint}>
      <span className="stat-n mono">{props.n}</span>
      <span className="stat-label">
        {props.label}
        {props.hint && <span className="stat-hint"> · {props.hint}</span>}
      </span>
    </div>
  );
}
