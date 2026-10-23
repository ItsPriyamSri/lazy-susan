import { useEffect, useRef, useState } from "react";
import { postJson } from "../lib/api";
import { timeHHMM } from "../lib/util";
import { Icon } from "./Icons";
import { messageOf } from "./Proof";

/**
 * Your own words. Used for questions like "why should we hire you", never
 * counted as a document. Saved into context.md, one file, no magic.
 *
 * Debounced autosave at 800ms plus an explicit save; the save marker quotes the
 * server, so it never says "Saved" before the server agrees.
 */
export function ContextCard(props: {
  initial: string;
  savedAt?: string | undefined;
  onSave: () => Promise<void>;
  onToast: (text: string) => void;
}): JSX.Element {
  const [text, setText] = useState(props.initial);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Refetches land while the reader is mid-sentence too; typing wins.
    if (!dirty) setText(props.initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.initial]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const save = async (next: string, quiet = false): Promise<void> => {
    setError(null);
    try {
      await postJson("/api/context", { text: next });
      await props.onSave();
      setDirty(false);
      setSavedNote(`Saved to context.md at ${timeHHMM(new Date().toISOString())}`);
      // Autosave is a background fact; only a deliberate click needs a toast.
      if (!quiet) props.onToast("Your paragraph is saved.");
    } catch (e) {
      setError(messageOf(e));
    }
  };

  const onChange = (next: string): void => {
    setText(next);
    setDirty(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(next, true), 800);
  };

  return (
    <section className="card context-card" aria-label="About you">
      <header className="context-head">
        <h3 className="section-title">About you</h3>
        <span className="context-meta">
          {text.length} characters
          {dirty ? <span className="context-dirty">unsaved</span> : savedNote ? <span className="context-saved">{savedNote}</span> : null}
        </span>
      </header>
      <p className="context-desc mono">Your own words. Used for questions like "why should we hire you", never counted as a document.</p>
      <textarea
        className="input context-input"
        rows={5}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Your own paragraph about yourself"
        placeholder="Write in your own voice — it gets read back, not paraphrased."
      />
      <div className="context-actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!dirty || error !== null}
          onClick={() => void save(text)}
        >
          <Icon name="check" />
          Save
        </button>

      </div>
      {error && <p className="field-error">{error}</p>}
    </section>
  );
}
