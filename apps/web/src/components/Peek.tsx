import type { PeekTarget } from "./Card";

interface Props {
  target: PeekTarget;
  onClose: () => void;
}

/** The page, with the rectangle the value was read from drawn on top of it. */
export function Peek({ target, onClose }: Props): JSX.Element {
  const src = `${import.meta.env.BASE_URL}pages/${target.file.replace(/\.pdf$/i, "")}-p${target.page}.png`;
  const { x, y, w, h } = target.bbox;

  return (
    <div className="peek-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Source page">
      <div className="peek" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <h3>{target.value || "Source"}</h3>
            <div className="file">
              {target.file} · page {target.page}
            </div>
          </div>
          <button className="btn small" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="stage">
          <div className="page">
            <img src={src} alt={`${target.file}, page ${target.page}`} />
            {w < 1 && (
              <span
                className="bbox"
                style={{
                  left: `${x * 100}%`,
                  top: `${y * 100}%`,
                  width: `${w * 100}%`,
                  height: `${h * 100}%`,
                }}
              />
            )}
          </div>
        </div>
        <div className="caption">
          This is the rectangle the app read. If the value were not here, the field would have been left for you.
        </div>
      </div>
    </div>
  );
}
