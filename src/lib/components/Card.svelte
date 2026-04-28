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
  class="rounded border border-neutral-800 bg-neutral-800 p-3 text-sm hover:border-neutral-700 cursor-grab active:cursor-grabbing select-none focus:outline-none focus:ring-1 focus:ring-neutral-600"
>
  <div class="font-medium text-neutral-100 break-words">{title}</div>
  {#if priority || tags.length > 0 || entry.subtaskTotal > 0}
    <div class="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-xs items-center">
      {#if priority}
        <span class="px-1.5 py-0.5 rounded bg-neutral-700 text-neutral-200">
          {priority}
        </span>
      {/if}
      {#each tags as tag}
        <span class="text-neutral-500">#{tag}</span>
      {/each}
      {#if entry.subtaskTotal > 0}
        <span class="text-neutral-500">
          {entry.subtaskDone}/{entry.subtaskTotal}
        </span>
      {/if}
    </div>
  {/if}
</div>
