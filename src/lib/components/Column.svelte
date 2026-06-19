<script lang="ts">
  import { tick } from "svelte";
  import { dndzone } from "svelte-dnd-action";
  import type { VaultEntry } from "$lib/api/vault";
  import { ui } from "$lib/stores/ui.svelte";
  import { withContextMenu } from "$lib/utils/contextMenu";
  import Card from "./Card.svelte";
  import RenameInput from "./RenameInput.svelte";

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
    onAddTask,
    onDeleteColumn,
    onRenameColumn,
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
    onAddTask?: (title: string) => Promise<void> | void;
    onDeleteColumn?: () => void;
    onRenameColumn?: (newName: string) => Promise<void> | void;
  } = $props();

  let renaming = $state(false);
  let taskTitle = $state("");
  let inputEl = $state<HTMLInputElement | undefined>();
  let submitting = $state(false);

  // Driven by the ui store so the keyboard shortcut (Cmd+N) and the
  // "Add a card" button are the same gesture, and only one column can
  // be in adding-mode at a time.
  const adding = $derived(ui.addingCardInColumn === name);

  $effect(() => {
    if (adding) tick().then(() => inputEl?.focus());
  });

  async function submitTask() {
    if (submitting) return;
    const trimmed = taskTitle.trim();
    if (!trimmed) {
      cancelAdding();
      return;
    }
    if (!onAddTask) return;
    submitting = true;
    try {
      await onAddTask(trimmed);
      taskTitle = "";
      ui.addingCardInColumn = null;
    } catch (e) {
      console.error("Failed to add task", e);
    } finally {
      submitting = false;
    }
  }

  function cancelAdding() {
    ui.addingCardInColumn = null;
    taskTitle = "";
  }

  function startAdding() {
    ui.addingCardInColumn = name;
  }

  function onTaskKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      submitTask();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelAdding();
    }
  }
</script>

<div
  class="flex flex-col w-72 shrink-0 bg-surface-1 rounded-md border max-h-full transition-opacity {isDragging
    ? 'opacity-50'
    : ''} {isDragTarget ? 'border-fg-faint' : 'border-border'}"
>
  {#if renaming && onRenameColumn}
    <div class="border-b border-border">
      <RenameInput
        initialValue={name}
        placeholder="column name"
        onSubmit={async (v) => {
          await onRenameColumn(v);
          renaming = false;
        }}
        onCancel={() => (renaming = false)}
      />
    </div>
  {:else}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      draggable={onHeaderDragStart ? "true" : "false"}
      ondragstart={onHeaderDragStart}
      ondragend={onHeaderDragEnd}
      ondragover={onHeaderDragOver}
      ondragleave={onHeaderDragLeave}
      ondrop={onHeaderDrop}
      use:withContextMenu={() => {
        const items: { label: string; action: () => void; danger?: boolean }[] = [];
        if (onRenameColumn)
          items.push({
            label: "Rename…",
            action: () => {
              renaming = true;
            },
          });
        if (onDeleteColumn)
          items.push({ label: "Delete column…", danger: true, action: onDeleteColumn });
        return items;
      }}
      class="px-3 py-2 border-b border-border text-sm font-medium text-fg flex items-center justify-between {onHeaderDragStart
        ? 'cursor-grab active:cursor-grabbing'
        : ''} select-none"
    >
      <span>{name}</span>
      <span class="text-xs text-fg-subtle">{items.length}</span>
    </div>
  {/if}
  <div
    class="flex-1 p-2 space-y-2 overflow-y-auto min-h-[100px]"
    use:dndzone={{ items, type: "card", flipDurationMs: 150, dropTargetStyle: {} }}
    onconsider={(e) => onConsider(e.detail.items as CardItem[])}
    onfinalize={(e) =>
      onFinalize(e.detail.items as CardItem[], e.detail.info as { id: string; trigger?: string })}
  >
    {#each items as item (item.id)}
      <Card entry={item} />
    {/each}
  </div>
  {#if onAddTask}
    <div class="px-2 pb-2 pt-1 border-t border-border">
      {#if adding}
        <input
          bind:this={inputEl}
          bind:value={taskTitle}
          onkeydown={onTaskKey}
          onblur={() => {
            if (!submitting) submitTask();
          }}
          placeholder="Card title"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          disabled={submitting}
          class="w-full bg-surface-2 border border-border-strong rounded px-2 py-1 text-sm text-fg outline-none placeholder:text-fg-faint disabled:opacity-50"
        />
      {:else}
        <button
          type="button"
          onclick={startAdding}
          class="w-full px-2 py-1.5 rounded text-sm text-fg-subtle hover:bg-surface-2/60 hover:text-fg text-left flex items-center gap-1.5"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            class="w-3.5 h-3.5"
          >
            <path d="M12 5v14M5 12h14" stroke-linecap="round" />
          </svg>
          <span>Add a card</span>
        </button>
      {/if}
    </div>
  {/if}
</div>
