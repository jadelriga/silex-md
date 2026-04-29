<script lang="ts">
  import { dndzone } from "svelte-dnd-action";
  import type { VaultEntry } from "$lib/api/vault";
  import Card from "./Card.svelte";

  type CardItem = VaultEntry & { id: string };

  let {
    name,
    items,
    isDragging = false,
    isDragTarget = false,
    onConsider,
    onFinalize,
    onHeaderDragStart,
    onHeaderDragEnd,
    onHeaderDragOver,
    onHeaderDragLeave,
    onHeaderDrop,
  }: {
    name: string;
    items: CardItem[];
    isDragging?: boolean;
    isDragTarget?: boolean;
    onConsider: (items: CardItem[]) => void;
    onFinalize: (items: CardItem[], info: { id: string; trigger?: string }) => void;
    onHeaderDragStart?: (e: DragEvent) => void;
    onHeaderDragEnd?: (e: DragEvent) => void;
    onHeaderDragOver?: (e: DragEvent) => void;
    onHeaderDragLeave?: (e: DragEvent) => void;
    onHeaderDrop?: (e: DragEvent) => void;
  } = $props();
</script>

<div
  class="flex flex-col w-72 shrink-0 bg-surface-1 rounded-md border max-h-full transition-opacity {isDragging
    ? 'opacity-50'
    : ''} {isDragTarget ? 'border-fg-faint' : 'border-border'}"
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    draggable={onHeaderDragStart ? "true" : "false"}
    ondragstart={onHeaderDragStart}
    ondragend={onHeaderDragEnd}
    ondragover={onHeaderDragOver}
    ondragleave={onHeaderDragLeave}
    ondrop={onHeaderDrop}
    class="px-3 py-2 border-b border-border text-sm font-medium text-fg flex items-center justify-between {onHeaderDragStart
      ? 'cursor-grab active:cursor-grabbing'
      : ''} select-none"
  >
    <span>{name}</span>
    <span class="text-xs text-fg-subtle">{items.length}</span>
  </div>
  <div
    class="flex-1 p-2 space-y-2 overflow-y-auto min-h-[100px]"
    use:dndzone={{ items, type: "card", flipDurationMs: 150, dropTargetStyle: {} }}
    onconsider={(e) => onConsider(e.detail.items as CardItem[])}
    onfinalize={(e) =>
      onFinalize(
        e.detail.items as CardItem[],
        e.detail.info as { id: string; trigger?: string },
      )}
  >
    {#each items as item (item.id)}
      <Card entry={item} />
    {/each}
  </div>
</div>
