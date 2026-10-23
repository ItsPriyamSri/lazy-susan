import type { Frame, Page } from "playwright-core";

/**
 * Reading a page's form, the way a person reads it.
 *
 * A control is not "input#name". It is a box with words next to it. So each
 * control is described by the words a human would read: the label, the
 * placeholder, the cell it sits in. A name attribute is used when it is there
 * and meaningful, but a page written by hand often has neither.
 */

export interface Control {
  /** Stable handle we set on the element, so we never guess a selector twice. */
  handle: string;
  tag: string;
  type: string;
  name: string;
  id: string;
  /** The words a person would read next to the box. */
  label: string;
  options?: string[];
  required: boolean;
}

const SKIP_TYPES = new Set(["hidden", "submit", "button", "reset", "image"]);

const EXTRACT = (skip: string[]) => {
  const out: {
    handle: string;
    tag: string;
    type: string;
    name: string;
    id: string;
    label: string;
    options?: string[];
    required: boolean;
  }[] = [];

  const clean = (s: string | null | undefined) =>
    (s ?? "")
      .replace(/\s+/g, " ")
      // "Full name * required" is a label with a form-builder's footnote on it.
      .replace(/\s*\*?\s*\(?(required|optional)\)?\s*$/i, "")
      .replace(/[*:]+$/, "")
      .trim();

  const elements = Array.from(
    document.querySelectorAll("input, select, textarea"),
  ) as (HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement)[];

  let n = 0;
  for (const el of elements) {
    if (el.disabled) continue;
    if (el instanceof HTMLInputElement && skip.includes(el.type)) continue;

    const handle = `ls-${n++}`;
    el.setAttribute("data-ls", handle);

    // The words around the box, in the order a person would find them.
    const id = el.id ?? "";
    const labelled = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
    const wrapping = el.closest("label");
    const cell = el.closest("td, th, .field, .form-group, .row, div");
    const before = cell ? clean(cell.firstChild?.textContent) : "";

    const candidates = [
      el.getAttribute("aria-label"),
      clean(labelled?.textContent),
      clean(wrapping?.textContent),
      el.getAttribute("placeholder"),
      before,
    ];

    const label = candidates.find((c) => c && c.length > 1) ?? "";

    out.push({
      handle,
      tag: el.tagName.toLowerCase(),
      type: el instanceof HTMLInputElement ? el.type : el.tagName.toLowerCase(),
      name: el.getAttribute("name") ?? "",
      id,
      label,
      options:
        el instanceof HTMLSelectElement
          ? Array.from(el.options)
              .map((o) => clean(o.textContent))
              .filter(Boolean)
          : undefined,
      required: el.required,
    });
  }

  // No form on the page at all is a result, not an error.
  return out;
};

export async function listControls(page: Page | Frame): Promise<Control[]> {
  return page.evaluate(EXTRACT, Array.from(SKIP_TYPES));
}

/** The label a person sees, or the best name-like string the page offers. */
export function labelFor(control: Control): string {
  if (control.label) return control.label;
  const human = (control.name || control.id).replace(/[_\-.[\]]+/g, " ").trim();
  return human || control.tag;
}
