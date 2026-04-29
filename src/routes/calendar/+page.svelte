<script lang="ts">
  import Calendar from "$lib/components/Calendar.svelte";
  import { tasks } from "$lib/stores/tasks.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import type { CalendarEventInput } from "$lib/calendar/CalendarAdapter";

  function priorityColor(p?: string) {
    switch (p) {
      case "high":
        return "#dc2626";
      case "medium":
        return "#d97706";
      case "low":
        return "#2563eb";
      default:
        return "#525252";
    }
  }

  const events = $derived.by<CalendarEventInput[]>(() => {
    const out: CalendarEventInput[] = [];
    for (const entry of tasks.entries.values()) {
      const fm = (entry.frontmatter ?? {}) as Record<string, unknown>;
      const due = fm.due;
      if (typeof due !== "string") continue;
      const fileName = entry.path.split("/").pop()?.replace(/\.md$/, "") ?? "";
      const title = (fm.title as string) ?? fileName;
      out.push({
        id: entry.path,
        title,
        date: due,
        color: priorityColor(fm.priority as string | undefined),
      });
    }
    return out;
  });

  function open(id: string) {
    ui.openTaskPath = id;
  }
</script>

<Calendar {events} onEventClick={open} />
