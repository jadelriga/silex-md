<script lang="ts">
  import type { VaultEntry } from "$lib/api/vault";
  import { ui } from "$lib/stores/ui.svelte";

  let { entry }: { entry: VaultEntry } = $props();

  const fm = $derived((entry.frontmatter ?? {}) as Record<string, unknown>);
  const fileName = $derived(
    entry.path.split("/").pop()?.replace(/\.md$/, "") ?? "",
  );
  const title = $derived((fm.title as string | undefined) ?? fileName);
  const priority = $derived(fm.priority as string | undefined);
  const tags = $derived((fm.tags as string[] | undefined) ?? []);

  function open() {
    ui.openTaskPath = entry.path;
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  }
</script>

<div
  role="button"
  tabindex="0"
  data-card
  onclick={open}
  onkeydown={onKey}
  class="rounded border border-border bg-surface-2 p-3 text-sm hover:border-border-strong cursor-grab active:cursor-grabbing select-none focus:outline-none focus:ring-1 focus:ring-fg-faint"
>
  <div class="font-medium text-fg break-words">{title}</div>
  {#if priority || tags.length > 0 || entry.subtaskTotal > 0}
    <div class="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs items-center">
      {#if priority}
        <span class="px-1.5 py-0.5 rounded bg-surface-3 text-fg">
          {priority}
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
