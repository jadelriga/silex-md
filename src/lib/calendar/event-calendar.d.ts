declare module "@event-calendar/core" {
  import type { Component } from "svelte";

  export const Calendar: Component<unknown>;
  export const DayGrid: unknown;
  export const TimeGrid: unknown;
  export const List: unknown;
  export const Interaction: unknown;
  export const ResourceTimeGrid: unknown;
  export const ResourceTimeline: unknown;

  export function createCalendar(
    target: HTMLElement,
    plugins: unknown[],
    options: Record<string, unknown>,
  ): unknown;

  export function destroyCalendar(calendar: unknown): void;
}

declare module "@event-calendar/day-grid" {
  const DayGrid: unknown;
  export default DayGrid;
}

declare module "@event-calendar/time-grid" {
  const TimeGrid: unknown;
  export default TimeGrid;
}

declare module "@event-calendar/core/index.css";
