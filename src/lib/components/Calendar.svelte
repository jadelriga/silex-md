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
      onDateClick?.(info.dateStr || isoDate(info.date)),
    height: "100%",
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
</style>
