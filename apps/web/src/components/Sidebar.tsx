import { Icon, type IconName } from "./Icons";

/**
 * The left rail. Brand, the overview, the forms, and one honest line at the
 * bottom about what the server knows. 232px fixed; a top bar under 900px.
 */
export function Sidebar(props: {
  forms: { id: string; title: string; kind: string; fields: number }[];
  openCounts: Record<string, number | undefined>;
  activeFormId: string | null;
  counters: { documents: number; facts: number; readable: number } | null;
  journal: { head: string; ok: boolean; entries: number } | null;
  serverUp: boolean;
  onOverview: () => void;
  onForm: (id: string) => void;
}): JSX.Element {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <circle cx="8" cy="8" r="6" />
            <circle cx="8" cy="8" r="1.6" />
            <path d="M3 11h10M3 5h10" />
          </svg>
        </div>
        <div>
          <div className="brand-name">Lazy Susan</div>
          <div className="brand-sub">It fills what the folder can prove. It never guesses.</div>
        </div>
      </div>

      <nav className="nav" aria-label="Sections">
        <button
          type="button"
          className={`nav-item${props.activeFormId === null ? " active" : ""}`}
          onClick={props.onOverview}
        >
          {navIcon("box")}
          <span>Overview</span>
        </button>

        <div className="nav-section-title">Forms</div>
        {props.forms.map((f) => (
          <button
            type="button"
            key={f.id}
            className={`nav-item${props.activeFormId === f.id ? " active" : ""}`}
            onClick={() => props.onForm(f.id)}
          >
            {navIcon("file")}
            <span className="nav-item-label">{f.title}</span>
            {props.openCounts[f.id] !== undefined && (props.openCounts[f.id] ?? 0) > 0 && (
              <span className="nav-badge" title={`${props.openCounts[f.id]} fields need a person`}>
                {props.openCounts[f.id]}
              </span>
            )}
          </button>
        ))}
        {props.forms.length === 0 && <div className="nav-item nav-item-empty">No forms on record</div>}
      </nav>

      <div className="sidebar-foot" title={`journal head ${props.journal?.head ?? "—"}`}>
        <span className={`dot${props.serverUp ? " dot-ok" : " dot-bad"}`} aria-hidden="true" />
        <span className="foot-text">
          {props.counters
            ? `${props.counters.documents} files · ${props.counters.facts} facts`
            : "loading the folder"}
        </span>
        {props.journal?.ok && (
          <span className="foot-check" aria-label="journal verified">
            ✓
          </span>
        )}
        <span className="foot-hash">{props.journal?.head ? props.journal.head.slice(0, 8) : ""}</span>
      </div>
    </aside>
  );
}

function navIcon(name: IconName): JSX.Element {
  return <Icon name={name} />;
}
