import { useEffect, type ReactNode } from "react";
import { Icon } from "./Icons";

/**
 * A panel that slides over the content. Closes with Esc, announces itself as a
 * dialog, and scrims so the close button is not decorative.
 */
export function Drawer(props: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props]);

  return (
    <>
      <div className="drawer-scrim" onClick={props.onClose} aria-hidden="true" />
      <aside className="drawer" role="dialog" aria-label={props.title}>
        <header className="drawer-head">
          <h2 className="drawer-title">{props.title}</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={props.onClose}
            aria-label={`Close ${props.title}`}
          >
            <Icon name="x" />
          </button>
        </header>
        <div className="drawer-body">{props.children}</div>
      </aside>
    </>
  );
}
