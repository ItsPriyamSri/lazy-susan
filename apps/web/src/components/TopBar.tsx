import { Icon } from "./Icons";

/**
 * The 48px top bar. It names where you are and when the folder was last read.
 * Under 900px it becomes the whole navigation surface.
 */
export function TopBar(props: {
  title: string;
  readAt?: string | undefined;
  busy?: boolean | undefined;
  onRefresh: () => void;
}): JSX.Element {
  return (
    <header className="topbar">
      <div className="topbar-title">{props.title}</div>
      <div className="topbar-right">
        {props.readAt && (
          <span className="topbar-meta">folder read at {timeOf(props.readAt)}</span>
        )}
        <button
          type="button"
          className="icon-btn"
          onClick={props.onRefresh}
          aria-label="Refresh from the brain"
          title="Refresh"
        >
          <Icon name="refresh" />
        </button>
      </div>
    </header>
  );
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
