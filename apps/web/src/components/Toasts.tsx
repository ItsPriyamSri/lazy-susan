import { Icon } from "./Icons";

/** One line of good news, at the bottom right. Nothing else uses it. */
export function Toasts(props: { items: { id: number; text: string }[] }): JSX.Element {
  return (
    <ul className="toasts" aria-live="polite">
      {props.items.map((t) => (
        <li key={t.id} className="toast">
          <Icon name="check" />
          <span>{t.text}</span>
        </li>
      ))}
    </ul>
  );
}
