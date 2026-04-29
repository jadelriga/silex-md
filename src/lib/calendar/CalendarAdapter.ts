export interface CalendarEventInput {
  id: string;
  title: string;
  date: string;
  color?: string;
}

export type CalendarView = "month" | "week";
