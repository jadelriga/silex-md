<script lang="ts">
  import Calendar from "$lib/components/Calendar.svelte";
  import { tasks } from "$lib/stores/tasks.svelte";
  import { reminders } from "$lib/stores/reminders.svelte";
  import { vault } from "$lib/stores/vault.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { goto } from "$app/navigation";
  import { noteHref, noteRelativePath } from "$lib/utils/notePath";
  import type { CalendarEventInput } from "$lib/calendar/CalendarAdapter";
  import type { VaultEntry } from "$lib/api/vault";

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

  function reminderDate(iso: string): string {
    return iso.split("T")[0];
  }

  function reminderTime(iso: string): string {
    const t = iso.split("T")[1];
    return t ? t.slice(0, 5) : "";
  }

  function entryTitle(e: VaultEntry): string {
    const fm = (e.frontmatter ?? {}) as Record<string, unknown>;
    const fileName = e.path.split("/").pop()?.replace(/\.md$/, "") ?? "";
    return (fm.title as string) ?? fileName;
  }

  function isPastReminder(e: VaultEntry): boolean {
    if (!vault.path) return false;
    return e.path.startsWith(`${vault.path}/reminders/past/`);
  }

  const events = $derived.by<CalendarEventInput[]>(() => {
    const out: CalendarEventInput[] = [];

    for (const entry of tasks.entries.values()) {
      const fm = (entry.frontmatter ?? {}) as Record<string, unknown>;
      const reminder = fm.reminder;
      if (typeof reminder !== "string" || !reminder) continue;
      const datePart = reminderDate(reminder);
      const timePart = reminderTime(reminder);
      const title = entryTitle(entry);
      out.push({
        id: entry.path,
        title: timePart ? `${timePart} ${title}` : title,
        date: datePart,
        color: priorityColor(fm.priority as string | undefined),
      });
    }

    for (const entry of reminders.entries.values()) {
      const fm = (entry.frontmatter ?? {}) as Record<string, unknown>;
      const reminder = fm.reminder;
      if (typeof reminder !== "string" || !reminder) continue;
      const datePart = reminderDate(reminder);
      const timePart = reminderTime(reminder);
      const title = entryTitle(entry);
      const past = isPastReminder(entry);
      out.push({
        id: entry.path,
        title: timePart ? `${timePart} ${title}` : title,
        date: datePart,
        color: past ? "#404040" : "#a16207",
      });
    }

    return out;
  });

  function openEvent(id: string) {
    if (id.includes("/reminders/")) {
      if (vault.path) {
        const rel = noteRelativePath(id, vault.path);
        goto(noteHref(rel));
      }
    } else {
      ui.openTaskPath = id;
    }
  }

  function openNewReminder(date: string) {
    ui.newReminder = { date };
  }
</script>

<Calendar {events} onEventClick={openEvent} onDateClick={openNewReminder} />
