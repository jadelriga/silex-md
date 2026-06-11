import { todayIsoDate } from "./reminder";

export interface CalendarDay {
  iso: string;
  day: number;
  inMonth: boolean;
}

/**
 * Monday-start 6×7 grid of days for the given month (`month` is 1–12).
 * Always 42 cells so the calendar height never jumps between months.
 */
export function monthGrid(year: number, month: number): CalendarDay[] {
  const first = new Date(year, month - 1, 1);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  const days: CalendarDay[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, month - 1, 1 - offset + i);
    days.push({
      iso: todayIsoDate(d),
      day: d.getDate(),
      inMonth: d.getMonth() === month - 1,
    });
  }
  return days;
}

export function addMonths(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: ((idx % 12) + 12) % 12 + 1 };
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export function monthOf(iso: string): { year: number; month: number } {
  const [y, m] = iso.split("-").map(Number);
  return { year: y, month: m };
}
