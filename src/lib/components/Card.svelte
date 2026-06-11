<script lang="ts">
  import type { VaultEntry } from "$lib/api/vault";
  import { ui } from "$lib/stores/ui.svelte";
  import { vault } from "$lib/stores/vault.svelte";
  import { tasks } from "$lib/stores/tasks.svelte";
  import { vaultApi } from "$lib/api/vault";
  import { confirm } from "$lib/stores/confirm.svelte";
  import { withContextMenu } from "$lib/utils/contextMenu";
  import { buildTaskContent } from "$lib/utils/yaml";
  import { formatReminder, formatReminderDate, reminderStatus } from "$lib/utils/reminder";

  let { entry }: { entry: VaultEntry } = $props();

  const fm = $derived((entry.frontmatter ?? {}) as Record<string, unknown>);
  const fileName = $derived(
    entry.path.split("/").pop()?.replace(/\.md$/, "") ?? "",
  );
  const title = $derived((fm.title as string | undefined) ?? fileName);
  const priority = $derived(fm.priority as string | undefined);
  const tags = $derived((fm.tags as string[] | undefined) ?? []);
  const reminder = $derived(
    typeof fm.reminder === "string" && fm.reminder ? fm.reminder : null,
  );
  const reminderState = $derived(reminderStatus(reminder));

  function open() {
    ui.openTaskPath = entry.path;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  }

  async function duplicateCard() {
    try {
      const newPath = await vaultApi.duplicateTask(entry.path);
      const newFm = { ...((entry.frontmatter ?? {}) as Record<string, unknown>) };
      if (typeof newFm.title === "string" && newFm.title) {
        // Retitle through the standard write path so the copy is
        // distinguishable on the board; untitled cards already get the
        // "-copy" file name as their display title.
        newFm.title = `${newFm.title} (copy)`;
        const body = await vaultApi.readTaskBody(newPath);
        await tasks.save(newPath, buildTaskContent(newFm, body));
      } else if (vault.path) {
        // Upsert now instead of waiting for the watcher so the copy
        // appears immediately.
        const newEntry = await vaultApi.readEntry(vault.path, newPath);
        if (newEntry) tasks.upsert(newEntry);
      }
    } catch (e) {
      console.error("Failed to duplicate card", e);
    }
  }

  function deleteCard() {
    const fileName = entry.path.split("/").pop()?.replace(/\.md$/, "") ?? "";
    const fm = (entry.frontmatter ?? {}) as Record<string, unknown>;
    const t = (fm.title as string) ?? fileName;
    confirm.ask({
      title: `Delete card "${t}"?`,
      message: "The file will be moved to the Trash.",
      confirmLabel: "Move to Trash",
      danger: true,
      onConfirm: async () => {
        if (ui.openTaskPath === entry.path) ui.openTaskPath = null;
        await vaultApi.deletePath(entry.path);
      },
    });
  }
</script>

<div
  role="button"
  tabindex="0"
  data-card
  onclick={open}
  onkeydown={onKey}
  use:withContextMenu={() => [
    { label: "Duplicate card", action: () => void duplicateCard() },
    { label: "Delete card…", danger: true, action: deleteCard },
  ]}
  class="rounded border border-border bg-surface-2 p-3 text-sm hover:border-border-strong cursor-grab active:cursor-grabbing select-none focus:outline-none focus:ring-1 focus:ring-fg-faint"
>
  <div class="font-medium text-fg break-words">{title}</div>
  {#if priority || reminder || tags.length > 0 || entry.subtaskTotal > 0}
    <div class="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs items-center">
      {#if priority}
        <span class="px-1.5 py-0.5 rounded bg-surface-3 text-fg">
          {priority}
        </span>
      {/if}
      {#if reminder}
        <span
          title={formatReminder(reminder)}
          class="flex items-center gap-1 {reminderState === 'overdue'
            ? 'text-red-400'
            : reminderState === 'today'
              ? 'text-amber-400'
              : 'text-fg-subtle'}"
        >
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="none"
            class="w-3 h-3 shrink-0"
            aria-hidden="true"
          >
            <path
              d="M12 2a1 1 0 0 1 1 1v.59a7.001 7.001 0 0 1 6 6.91V14l1.7 2.55A1 1 0 0 1 19.86 18H4.14a1 1 0 0 1-.84-1.45L5 14V10.5a7.001 7.001 0 0 1 6-6.91V3a1 1 0 0 1 1-1zm-2.5 18a2.5 2.5 0 0 0 5 0h-5z"
            />
          </svg>
          {formatReminderDate(reminder)}
        </span>
      {/if}
      {#each tags as tag}
        <span class="text-fg-subtle">#{tag}</span>
      {/each}
      {#if entry.subtaskTotal > 0}
        <span class="text-fg-subtle">
          {entry.subtaskDone}/{entry.subtaskTotal}
        </span>
      {/if}
    </div>
  {/if}
</div>
