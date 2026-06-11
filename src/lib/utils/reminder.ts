export interface ReminderParts {
  date: string;
  time: string;
}

export function todayIsoDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function currentTimeHM(now: Date = new Date()): string {
  const h = String(now.getHours()).padStart(2, "0");
  const m = String(now.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export function splitReminder(iso: string | null | undefined): ReminderParts {
  if (!iso || typeof iso !== "string") {
    return { date: todayIsoDate(), time: "09:00" };
  }
  const [datePart, timePart = ""] = iso.split("T");
  const time = timePart.slice(0, 5) || "09:00";
  return { date: datePart || todayIsoDate(), time };
}

export function joinReminder(date: string, time: string): string {
  const t = time && /^\d{2}:\d{2}$/.test(time) ? time : "09:00";
  return `${date}T${t}`;
}

export function formatReminder(iso: string | null | undefined): string {
  if (!iso || typeof iso !== "string") return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Compact date-only label ("Jun 12") for card badges; the year is added
 * only when it differs from the current one. */
export function formatReminderDate(
  iso: string | null | undefined,
  now: Date = new Date(),
): string {
  if (!iso || typeof iso !== "string") return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (d.getFullYear() !== now.getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString(undefined, opts);
}

export type ReminderStatus = "overdue" | "today" | "upcoming";

/** Classify a reminder relative to `now` for badge colouring. */
export function reminderStatus(
  iso: string | null | undefined,
  now: Date = new Date(),
): ReminderStatus | null {
  if (!iso || typeof iso !== "string") return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  if (d.getTime() < now.getTime()) return "overdue";
  if (todayIsoDate(d) === todayIsoDate(now)) return "today";
  return "upcoming";
}
