import { useState } from "react";
import type { PortalPlan, PortalResponse } from "../lib/types";
import { Icon } from "./Icons";

export interface BrowserView {
  response: PortalResponse;
}

/**
 * The standout: the brain opens the actual page in a browser, types what the
 * index can prove, and rings what it cannot. Nothing here presses submit.
 */
export function BrowserPanel(props: {
  formId: string;
  formTitle: string;
  view: BrowserView | null;
  busy: boolean;
  error: string | null;
  onStart: () => void;
  onRefill: () => void;
  onClose: () => void;
}): JSX.Element {
  const v = props.view;

  if (!v) {
    return (
      <section className="card browser" aria-label="Browser panel">
        <header className="browser-head">
          <h3 className="section-title">
            <Icon name="globe" />
            The page itself
          </h3>
          <button
            type="button"
            className="btn btn-amber"
            onClick={props.onStart}
            disabled={props.busy}
            title="The brain opens a browser and types what it can prove"
          >
            {props.busy ? "Opening the browser…" : "Open the page and type it"}
          </button>
        </header>
        {props.error && <p className="field-error">{props.error}</p>}
        <p className="browser-note">
          It types the filled values, leaves the rest ringing in amber, and stops there. You check
          the page and you send it.
        </p>
      </section>
    );
  }

  const r = v.response;
  const typed = r.outcomes.filter((o) => o.status === "filled");
  const needs = r.outcomes.filter((o) => o.status === "open");
  const notOurs = r.outcomes.filter((o) => o.status === "not-ours");

  return (
    <section className="card browser" aria-label="Browser panel">
      <header className="browser-head">
        <h3 className="section-title">
          <Icon name="globe" />
          The page itself
        </h3>
        <div className="browser-actions">
          <button type="button" className="btn btn-amber" onClick={props.onRefill} disabled={props.busy}>
            {props.busy ? "Typing…" : "Type my new answers"}
          </button>
          <button type="button" className="btn btn-quiet" onClick={props.onClose}>
            <Icon name="close" />
            Close browser
          </button>
        </div>
      </header>

      {r.liveView ? (
        <a className="browser-live" href={r.liveView} target="_blank" rel="noreferrer">
          <Icon name="play" />
          <span>Live view — watch the typing in real time</span>
        </a>
      ) : (
        r.screenshot && (
          <figure className="browser-frame">
            <div className="browser-address" title={r.url}>
              <span className="browser-dot" aria-hidden="true" />
              <span className="browser-url">{r.url}</span>
            </div>
            <div className="browser-scroll">
              <img
                alt={`The ${props.formTitle} page after Lazy Susan typed it`}
                src={`data:image/png;base64,${r.screenshot}`}
              />
            </div>
          </figure>
        )
      )}

      <p className="browser-note">
        Nothing here presses submit. You check it and you send it.
      </p>

      <div className="browser-groups">
        <OutcomeGroup title="Typed" tone="ok" items={typed} empty="Nothing was typed yet." />
        <OutcomeGroup title="Needs you" tone="amber" items={needs} empty="Nothing…" />
        <OutcomeGroup title="Not ours" tone="grey" items={notOurs} empty="Nothing." />
      </div>

      {props.error && <p className="field-error">{props.error}</p>}
    </section>
  );
}

function OutcomeGroup(props: {
  title: string;
  tone: "ok" | "amber" | "grey";
  items: PortalResponse["outcomes"];
  empty: string;
}): JSX.Element {
  return (
    <div className={`o-group o-${props.tone}`}>
      <span className="label-caps o-title">{props.title}</span>
      {props.items.length === 0 && <span className="o-empty">{props.empty}</span>}
      <ul className="o-list">
        {props.items.map((o) => (
          <li key={o.handle} className="o-row">
            <span className="o-label">{o.label}</span>
            <span className="o-reason">{o.reason ?? (o.value ? String(o.value) : "")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
