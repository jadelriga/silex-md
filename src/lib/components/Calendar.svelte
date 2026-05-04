<script lang="ts">
  import { onMount, onDestroy, mount, unmount } from "svelte";
  import type { CalendarEventInput } from "$lib/calendar/CalendarAdapter";
  import { theme } from "$lib/stores/theme.svelte";

  let {
    events,
    onEventClick,
    onDateClick,
  }: {
    events: CalendarEventInput[];
    onEventClick?: (id: string) => void;
    onDateClick?: (date: string) => void;
  } = $props();

  let target: HTMLDivElement;
  let cal: ReturnType<typeof mount> | null = null;

  function toEcEvents(input: CalendarEventInput[]) {
    return input.map((e) => ({
      id: e.id,
      title: e.title,
      start: e.date,
      end: e.date,
      allDay: true,
      color: e.color,
    }));
  }

  let calOptions = $state({
    view: "dayGridMonth",
    events: [] as ReturnType<typeof toEcEvents>,
    eventClick: (info: { event: { id: string } }) => onEventClick?.(info.event.id),
    dateClick: (info: { date: Date; dateStr: string }) =>
      // EC's dateStr is YYYY-MM-DDTHH:MM:SS (19 chars) — slice to YYYY-MM-DD
      // so <input type="date"> accepts it. Fall back to local-time formatting
      // if dateStr is missing for any reason.
      onDateClick?.(info.dateStr ? info.dateStr.slice(0, 10) : isoDate(info.date)),
    height: "100%",
    // Enables EC's `.ec-uniform` class on .ec-main, which switches the row
    // template from `auto` (content height) to `minmax(0, 1fr)` and adds
    // `flex-grow: 1` so the grid fills the container. Without this, EC
    // collapses to ~5 rows of natural height regardless of the flex chain
    // above it. Side-effect: events that overflow a cell get a "+N more"
    // link instead of stretching the row, which is the right trade-off.
    dayMaxEvents: true,
    locale: "en-US",
    firstDay: 1,
  });

  function isoDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  $effect(() => {
    calOptions.events = toEcEvents(events);
  });

  onMount(async () => {
    try {
      const ec = await import("@event-calendar/core");
      cal = mount(ec.Calendar as never, {
        target,
        props: {
          plugins: [ec.DayGrid, ec.Interaction],
          options: calOptions,
        },
      });
    } catch (err) {
      console.error("Calendar mount failed", err);
    }
  });

  onDestroy(() => {
    if (cal) unmount(cal);
    cal = null;
  });
</script>

<div
  bind:this={target}
  class="flex-1 min-h-0 silex-cal {theme.effective === 'dark' ? 'ec-dark' : ''}"
></div>

<style>
  .silex-cal {
    display: flex;
    flex-direction: column;
  }
  .silex-cal :global(.ec) {
    background-color: var(--color-surface);
    border: none;
    border-radius: 0;
    flex: 1 1 0%;
    min-height: 0;
    --ec-border-color: var(--color-border);
  }
  .silex-cal :global(.ec-toolbar) {
    border-bottom: 1px solid var(--color-border);
    padding: 0.75rem 1rem;
  }
  .silex-cal :global(.ec-button) {
    background-color: var(--color-surface-1);
    border-color: var(--color-border);
    color: var(--color-fg);
  }
  .silex-cal :global(.ec-button:hover) {
    background-color: var(--color-surface-2);
  }
  /* Days and events are both clickable (day → new-reminder modal,
     event → task detail). Show that with a pointer cursor. */
  .silex-cal :global(.ec-day),
  .silex-cal :global(.ec-event) {
    cursor: pointer;
  }
</style>
