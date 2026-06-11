export const REPEATS = ["daily", "weekly", "biweekly", "monthly", "yearly"] as const;
export type Repeat = (typeof REPEATS)[number];

/** Tolerates hand-edited frontmatter: anything but the known values is
 * treated as "no repeat", never an error. */
export function parseRepeat(value: unknown): Repeat | null {
  return typeof value === "string" && (REPEATS as readonly string[]).includes(value)
    ? (value as Repeat)
    : null;
}

export function repeatLabel(repeat: Repeat): string {
  switch (repeat) {
    case "daily":
      return "daily";
    case "weekly":
      return "weekly";
    case "biweekly":
      return "every 2 weeks";
    case "monthly":
      return "monthly";
    case "yearly":
      return "yearly";
  }
}

interface Parts {
  y: number;
  mo: number; // 1-12
  d: number;
  h: number;
  mi: number;
}

function parseLocalIso(iso: string): Parts | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(iso);
  if (!m) return null;
  return {
    y: Number(m[1]),
    mo: Number(m[2]),
    d: Number(m[3]),
    h: m[4] !== undefined ? Number(m[4]) : 9,
    mi: m[5] !== undefined ? Number(m[5]) : 0,
  };
}

function fmt(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function daysInMonth(y: number, mo: number): number {
  return new Date(y, mo, 0).getDate();
}

/**
 * The earliest occurrence of the series strictly after `after`, as a local
 * "YYYY-MM-DDTHH:MM" string, or null for an unparseable anchor.
 *
 * Occurrences are computed from the series anchor (`repeatFrom`), not from
 * the previously fired occurrence — that's what keeps "monthly on the 31st"
 * on the 31st (clamped to shorter months in passing, e.g. Feb 28) instead of
 * permanently drifting to the 28th after one February. Advancing by calendar
 * components rather than epoch milliseconds keeps the wall-clock time stable
 * across DST changes.
 */
export function nextOccurrence(repeat: Repeat, anchorIso: string, after: Date): string | null {
  const a = parseLocalIso(anchorIso);
  if (!a) return null;

  if (repeat === "daily" || repeat === "weekly" || repeat === "biweekly") {
    const periodDays = repeat === "daily" ? 1 : repeat === "weekly" ? 7 : 14;
    const anchorDate = new Date(a.y, a.mo - 1, a.d, a.h, a.mi);
    // Estimate the step count, then correct: DST makes calendar days vary
    // in length, so the candidate can land one period off.
    let k = Math.max(
      0,
      Math.ceil((after.getTime() - anchorDate.getTime()) / (periodDays * 86_400_000)),
    );
    let candidate = new Date(a.y, a.mo - 1, a.d + k * periodDays, a.h, a.mi);
    while (candidate.getTime() <= after.getTime()) {
      k += 1;
      candidate = new Date(a.y, a.mo - 1, a.d + k * periodDays, a.h, a.mi);
    }
    return fmt(candidate);
  }

  // monthly / yearly: step whole months from the anchor, clamping the
  // anchor's day-of-month to the target month's length.
  const monthStep = repeat === "monthly" ? 1 : 12;
  const at = (k: number): Date => {
    const monthIndex = a.y * 12 + (a.mo - 1) + k * monthStep;
    const y = Math.floor(monthIndex / 12);
    const mo = (monthIndex % 12) + 1;
    return new Date(y, mo - 1, Math.min(a.d, daysInMonth(y, mo)), a.h, a.mi);
  };
  const monthsAhead =
    (after.getFullYear() - a.y) * 12 + (after.getMonth() + 1 - a.mo);
  let k = Math.max(0, Math.floor(monthsAhead / monthStep) - 1);
  while (at(k).getTime() <= after.getTime()) k += 1;
  return fmt(at(k));
}
