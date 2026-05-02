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
