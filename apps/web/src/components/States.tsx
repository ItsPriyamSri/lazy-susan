import { Icon } from "./Icons";

/** The three honest states, beside whatever else the panel shows. */

export function Skeleton(): JSX.Element {
  return (
    <div className="states" aria-busy="true" aria-label="Loading">
      <div className="stat-row skeleton-row">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="skel stat-skel" />
        ))}
      </div>
      <div className="skel block-skel" />
      <div className="skel block-skel" />
      <div className="skel tall-skel" />
    </div>
  );
}

export function ApiBanner(props: { onRetry: () => void }): JSX.Element {
  return (
    <div className="card banner" role="alert">
      <div className="banner-row">
        <span className="dot dot-bad" aria-hidden="true" />
        <h3 className="section-title">The brain is not running</h3>
      </div>
      <p className="banner-text">Nothing can be read, filled or proved until it is. From the repo root:</p>
      <code className="banner-code mono">pnpm start</code>
      <div>
        <button type="button" className="btn btn-primary" onClick={props.onRetry}>
          <Icon name="refresh" />
          Try again
        </button>
      </div>
    </div>
  );
}

export function EmptyFolder(): JSX.Element {
  return (
    <div className="card empty">
      <Icon name="box" size={20} />
      <h3 className="section-title">An empty shoebox</h3>
      <p className="muted empty-line">
        Nothing is in the folder yet. Drop your first file above; the app will read it, say what it
        found, and point at the page it found it on.
      </p>
    </div>
  );
}

/** Server errors keep the server's own sentence; toasts confirm only. */
export function ErrorLine(props: { message: string }): JSX.Element {
  return (
    <p className="field-error" role="alert">
      {props.message}
    </p>
  );
}
