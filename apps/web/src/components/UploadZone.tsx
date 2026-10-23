import { useRef, useState, type DragEvent } from "react";
import { uploadFile } from "../lib/api";
import type { UploadResponse } from "../lib/types";
import { plural } from "../lib/util";
import { Icon } from "./Icons";
import { messageOf } from "./Proof";

const ACCEPT = ".pdf,.docx,.txt,.md";

interface UploadItem {
  name: string;
  state: "waiting" | "reading" | "done" | "error";
  body?: UploadResponse | undefined;
  error?: string | undefined;
}

/**
 * The folder's front door: a real redaction-honest upload. Files land in the
 * brain as they do — .pdf, .docx, .txt, .md — and the brain says what happened.
 */
export function UploadZone(props: { onUploaded: () => void }): JSX.Element {
  const [over, setOver] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const send = async (files: File[]): Promise<void> => {
    const queued: UploadItem[] = files.map((f) => ({ name: f.name, state: "reading" }));
    setItems((prev) => [...queued, ...prev].slice(0, 8));
    let changed = false;
    for (const f of files) {
      if (!/\.(pdf|docx|txt|md)$/i.test(f.name)) {
        setItems((prev) => mark(prev, f.name, { state: "error", error: "only .pdf, .docx, .txt and .md are read" }));
        continue;
      }
      try {
        const body = await uploadFile<UploadResponse>("/api/documents", f);
        changed = true;
        setItems((prev) => mark(prev, f.name, { state: "done", body }));
      } catch (e) {
        const msg = e instanceof Error ? e.message : messageOf(e);
        setItems((prev) => mark(prev, f.name, { state: "error", error: msg }));
      }
    }
    // One reload after the batch, so the reader does not watch five refetches.
    if (changed) props.onUploaded();
  };

  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    setOver(false);
    void send([...e.dataTransfer.files]);
  };

  return (
    <section className="card upload" aria-label="Add to the folder">
      <h3 className="section-title">Add a document</h3>
      <div
        className={`dropzone${over ? " dropzone-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <Icon name="upload" />
        <p>Drop a PDF, DOCX, TXT or MD file here</p>
        <button type="button" className="btn btn-quiet" onClick={() => inputRef.current?.click()}>
          Choose a file
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            void send([...(e.target.files ?? [])]);
            e.currentTarget.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <ul className="upload-results">
          {items.map((it, i) => (
            <li key={i} className={`upload-item${it.state === "error" ? " upload-err" : ""}`}>
              <div className="upload-file">
                <Icon name="file" />
                <span className="mono">{it.name}</span>
                {it.state === "reading" && <span className="upload-state">being read…</span>}
                {it.state === "done" && it.body && <UploadedLine body={it.body} />}
              </div>
              {it.state === "error" && <p className="field-error">{it.error}</p>}
              {it.state === "done" && it.body && !it.body.readable && (
                <p className="upload-unreadable">
                  readable: no — it is a photograph of a page. Nickname a real scanner over it, or
                  type the values when a field asks.
                </p>
              )}
              {it.state === "done" && it.body?.readable && it.body.extraction?.facts && it.body.extraction.facts.length > 0 && (
                <ul className="upload-facts">
                  {it.body.extraction.facts.slice(0, 4).map((f, j) => (
                    <li key={j} className="mono">
                      <span className="upload-key">{f.key}</span>
                      {f.value}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function mark(list: UploadItem[], name: string, patch: Partial<UploadItem>): UploadItem[] {
  const idx = list.findIndex((x) => x.name === name && x.state !== "done");
  if (idx < 0) return list;
  const copy = [...list];
  copy[idx] = { ...copy[idx]!, ...patch };
  return copy;
}

function UploadedLine(props: { body: UploadResponse }): JSX.Element {
  const b = props.body;
  return (
    <span className="upload-state">
      {plural(b.facts, "fact", "facts")} read
      {b.unplaced > 0 ? `, ${b.unplaced} unplaced` : ""}
      {b.kind !== "other" ? ` · ${b.kind.replace("_", " ")}` : ""}
    </span>
  );
}
