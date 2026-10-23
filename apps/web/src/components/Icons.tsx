/**
 * The icons for this interface, drawn inline. 16px, stroke 1.5, no fills, no
 * emoji — a tool should look like a tool.
 */
export function Icon(
  props: { name: IconName; size?: number | undefined; label?: string | undefined } & Record<string, unknown>,
): JSX.Element {
  const { name, size = 16, label } = props;
  const paths = PATHS[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {paths}
    </svg>
  );
}

export type IconName =
  | "box"
  | "file"
  | "check"
  | "warning"
  | "eye"
  | "x"
  | "chevron"
  | "refresh"
  | "undo"
  | "upload"
  | "play"
  | "close"
  | "globe"
  | "mic"
  | "pen"
  | "download";

const PATHS: Record<IconName, JSX.Element> = {
  box: (
    <>
      <rect x="2" y="4" width="12" height="10" rx="1" />
      <path d="M2 6.5h12" />
    </>
  ),
  file: (
    <>
      <path d="M4 1.5h5.5L12.5 4.5V14.5H4z" />
      <path d="M9.5 1.5v3h3" />
    </>
  ),
  check: <path d="M3 8.5 6.5 12 13 4.5" />,
  warning: (
    <>
      <path d="M8 2 14.5 13.5H1.5z" />
      <path d="M8 6.5v3.5" />
      <path d="M8 11.7v.1" />
    </>
  ),
  eye: (
    <>
      <path d="M1.5 8s2.5-4 6.5-4 6.5 4 6.5 4-2.5 4-6.5 4-6.5-4-6.5-4z" />
      <circle cx="8" cy="8" r="2" />
    </>
  ),
  x: (
    <>
      <path d="M4 4l8 8" />
      <path d="M12 4l-8 8" />
    </>
  ),
  chevron: <path d="M6 3.5 10.5 8 6 12.5" />,
  refresh: (
    <>
      <path d="M13 8a5 5 0 1 1-1.7-3.75" />
      <path d="M13 1.5V4.5h-3" />
    </>
  ),
  undo: (
    <>
      <path d="M3 7h7a3.5 3.5 0 0 1 0 7H7" />
      <path d="M6 4 3 7l3 3" />
    </>
  ),
  upload: (
    <>
      <path d="M8 10V2.5" />
      <path d="M5 5 8 2l3 3" />
      <path d="M2.5 11v2.5h11V11" />
    </>
  ),
  play: <path d="M5 3.5v9l7-4.5z" />,
  close: (
    <>
      <path d="M3 3l10 10" />
      <path d="M13 3 3 13" />
    </>
  ),
  globe: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12" />
      <path d="M8 2c2.5 2.7 2.5 9.3 0 12-2.5-2.7-2.5-9.3 0-12z" />
    </>
  ),
  mic: (
    <>
      <rect x="6" y="1.5" width="4" height="7.5" rx="2" />
      <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0" />
      <path d="M8 12v2.5" />
    </>
  ),
  pen: (
    <>
      <path d="M11 2.5a1.8 1.8 0 0 1 2.5 2.5L5 13.5 2 14l.5-3z" />
    </>
  ),
  download: (
    <>
      <path d="M8 2.5V10" />
      <path d="M5 7l3 3 3-3" />
      <path d="M2.5 11v2.5h11V11" />
    </>
  ),
};
