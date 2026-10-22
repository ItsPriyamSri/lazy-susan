/** Date parsing that survives the way dates actually appear on paper. */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

export interface Ymd {
  y: number;
  m: number;
  d: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function toISO(d: Ymd): string {
  return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
}

export function parseDate(raw: string | undefined | null): Ymd | null {
  if (!raw) return null;
  const s = raw.trim().replace(/\s+/g, " ");

  // 2025-08-04
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return { y: +m[1]!, m: +m[2]!, d: +m[3]! };

  // 14 MAR 2003  /  14 March 2003  /  14-Mar-2003
  m = /^(\d{1,2})[\s\-.]+([A-Za-z]{3,9})[\s\-.]+(\d{4})$/.exec(s);
  if (m) {
    const mon = MONTHS[m[2]!.toLowerCase()];
    if (mon) return { y: +m[3]!, m: mon, d: +m[1]! };
  }

  // March 2003
  m = /^([A-Za-z]{3,9})[\s\-.]+(\d{4})$/.exec(s);
  if (m) {
    const mon = MONTHS[m[1]!.toLowerCase()];
    if (mon) return { y: +m[2]!, m: mon, d: 1 };
  }

  // 04/08/2025 -- day first, which is what most of the world writes and what
  // shows up on the documents in the corpus.
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    const d = +m[1]!;
    const mo = +m[2]!;
    if (d > 12 && mo <= 12) return { y: +m[3]!, m: mo, d };
    if (mo > 12 && d <= 12) return { y: +m[3]!, m: d, d: mo };
    return { y: +m[3]!, m: mo, d };
  }

  return null;
}

export function isBefore(a: Ymd, b: Ymd): boolean {
  if (a.y !== b.y) return a.y < b.y;
  if (a.m !== b.m) return a.m < b.m;
  return a.d < b.d;
}

export function monthsBetween(from: Ymd, to: Ymd): number {
  const months = (to.y - from.y) * 12 + (to.m - from.m);
  return months + (to.d < from.d ? -1 : 0);
}

export function addMonths(d: Ymd, n: number): Ymd {
  const total = (d.y * 12 + (d.m - 1)) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { y, m, d: Math.min(d.d, lastDay) };
}

export function formatLong(d: Ymd): string {
  const names = ["", "January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];
  return `${d.d} ${names[d.m]} ${d.y}`;
}

/** "5 months ago" — used in the one-line reason on a card. */
export function ago(from: Ymd, to: Ymd): string {
  const months = monthsBetween(from, to);
  if (months <= 0) {
    const days = Math.max(0, Math.round((Date.UTC(to.y, to.m - 1, to.d) - Date.UTC(from.y, from.m - 1, from.d)) / 86400000));
    return days === 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`;
  }
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  return rem ? `${years}y ${rem}m ago` : `${years} year${years === 1 ? "" : "s"} ago`;
}

/** Local calendar date, no timezone arithmetic. */
export function today(now: Date = new Date()): Ymd {
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}
