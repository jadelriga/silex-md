<script lang="ts">
  import { onMount, onDestroy, mount, unmount } from "svelte";
  import type { CalendarEventInput } from "$lib/calendar/CalendarAdapter";

  let {
    events,
    onEventClick,
  }: {
    events: CalendarEventInput[];
    onEventClick?: (id: string) => void;
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
    height: "100%",
    locale: "en-US",
    firstDay: 1,
  });

  $effect(() => {
    calOptions.events = toEcEvents(events);
  });

  onMount(async () => {
    try {
      const ec = await import("@event-calendar/core");
      cal = mount(ec.Calendar as never, {
        target,
        props: {
          plugins: [ec.DayGrid],
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

<div bind:this={target} class="ec-dark flex-1 min-h-0 silex-cal"></div>

<style>
  .silex-cal {
    display: flex;
    flex-direction: column;
  }
  .silex-cal :global(.ec) {
    background-color: rgb(10 10 10);
    border: none;
    border-radius: 0;
    flex: 1 1 0%;
    min-height: 0;
    --ec-border-color: rgb(38 38 38);
  }
  .silex-cal :global(.ec-toolbar) {
    border-bottom: 1px solid rgb(38 38 38);
    padding: 0.75rem 1rem;
  }
  .silex-cal :global(.ec-button) {
    background-color: rgb(23 23 23);
    border-color: rgb(38 38 38);
    color: rgb(212 212 212);
  }
  .silex-cal :global(.ec-button:hover) {
    background-color: rgb(38 38 38);
  }
</style>
