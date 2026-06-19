<script lang="ts">
  import { generateKeyBetween } from "fractional-indexing";
  import { tasks } from "$lib/stores/tasks.svelte";
  import { boards } from "$lib/stores/boards.svelte";
  import { vault } from "$lib/stores/vault.svelte";
  import { vaultApi, type VaultEntry } from "$lib/api/vault";
  import { sortCards, getOrder } from "$lib/utils/order";
  import { buildTaskContent } from "$lib/utils/yaml";
  import { confirm } from "$lib/stores/confirm.svelte";
  import Column from "./Column.svelte";
  import CreateInput from "./CreateInput.svelte";

  let { name }: { name: string } = $props();

  type CardItem = VaultEntry & { id: string };

  let columnsState = $state<Record<string, CardItem[]>>({});
  let columnOrder = $state<string[]>([]);
  let draggingColumn = $state<string | null>(null);
  let dragTargetColumn = $state<string | null>(null);
  let addingColumn = $state(false);

  $effect(() => {
    const grouped: Record<string, CardItem[]> = {};
    const layout = boards.list.find((b) => b.name === name);
    const knownColumns = layout ? layout.columns : [];
    for (const col of knownColumns) {
      grouped[col] = [];
    }
    for (const entry of tasks.entries.values()) {
      if (entry.board !== name || !entry.column) continue;
      if (!grouped[entry.column]) grouped[entry.column] = [];
      grouped[entry.column].push({ ...entry, id: entry.path });
    }
    for (const col of Object.keys(grouped)) {
      grouped[col] = sortCards(grouped[col]);
    }
    columnsState = grouped;
    // Order: use layout order, fall back to alphabetical for any extras
    const order: string[] = [];
    for (const c of knownColumns) {
      if (grouped[c]) order.push(c);
    }
    for (const c of Object.keys(grouped).sort()) {
      if (!order.includes(c)) order.push(c);
    }
    columnOrder = order;
  });

  function handleConsider(colName: string, items: CardItem[]) {
    columnsState = { ...columnsState, [colName]: items };
  }

  async function handleFinalize(
    colName: string,
    finalItems: CardItem[],
    info: { id: string; trigger?: string },
  ) {
    columnsState = { ...columnsState, [colName]: finalItems };

    if (info.trigger === "droppedOutsideOfAny") return;

    const movedPath = info.id;
    const idx = finalItems.findIndex((i) => i.id === movedPath);
    if (idx === -1) return;

    const movedEntry = tasks.entries.get(movedPath);
    if (!movedEntry || !movedEntry.board || !movedEntry.column || !vault.path) return;

    const prev = idx > 0 ? finalItems[idx - 1] : null;
    const next = idx < finalItems.length - 1 ? finalItems[idx + 1] : null;
    const prevOrder = prev ? getOrder(prev) : null;
    const nextOrder = next ? getOrder(next) : null;
    const newOrder = generateKeyBetween(prevOrder, nextOrder);

    const body = await vaultApi.readTaskBody(movedPath);
    const fm = {
      ...((movedEntry.frontmatter ?? {}) as Record<string, unknown>),
      order: newOrder,
    };
    const content = buildTaskContent(fm, body);

    if (movedEntry.column === colName) {
      await tasks.save(movedPath, content);
    } else {
      const filename = movedPath.split("/").pop()!;
      const newPath = `${vault.path}/boards/${movedEntry.board}/${colName}/${filename}`;
      await vaultApi.moveTask(movedPath, newPath);
      tasks.remove(movedPath);
      await tasks.save(newPath, content);
    }
  }

  function onColumnDragStart(e: DragEvent, colName: string) {
    draggingColumn = colName;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", colName);
    }
  }

  function onColumnDragEnd() {
    draggingColumn = null;
    dragTargetColumn = null;
  }

  function onColumnDragOver(e: DragEvent, overName: string) {
    if (!draggingColumn) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    if (overName !== draggingColumn) dragTargetColumn = overName;
  }

  function onColumnDragLeave(overName: string) {
    if (dragTargetColumn === overName) dragTargetColumn = null;
  }

  async function onColumnDrop(e: DragEvent, overName: string) {
    e.preventDefault();
    e.stopPropagation();
    const source = draggingColumn;
    draggingColumn = null;
    dragTargetColumn = null;
    if (!source || source === overName || !vault.path) return;

    const next = columnOrder.filter((c) => c !== source);
    const insertAt = next.indexOf(overName);
    if (insertAt === -1) return;
    next.splice(insertAt, 0, source);
    columnOrder = next;

    try {
      await vaultApi.setBoardColumnOrder(vault.path, name, next);
      await boards.load(vault.path);
    } catch (err) {
      console.error("Failed to set column order", err);
      await boards.load(vault.path);
    }
  }

  async function onTrailingDragOver(e: DragEvent) {
    if (!draggingColumn) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
  }

  async function onTrailingDrop(e: DragEvent) {
    e.preventDefault();
    const source = draggingColumn;
    draggingColumn = null;
    dragTargetColumn = null;
    if (!source || !vault.path) return;
    const next = columnOrder.filter((c) => c !== source);
    next.push(source);
    if (JSON.stringify(next) === JSON.stringify(columnOrder)) return;
    columnOrder = next;
    try {
      await vaultApi.setBoardColumnOrder(vault.path, name, next);
      await boards.load(vault.path);
    } catch (err) {
      console.error("Failed to set column order", err);
      await boards.load(vault.path);
    }
  }

  async function handleCreateColumn(columnName: string) {
    if (!vault.path) return;
    await vaultApi.createColumn(vault.path, name, columnName);
    addingColumn = false;
    await boards.load(vault.path);
  }

  async function handleAddTask(columnName: string, title: string) {
    if (!vault.path) return;
    const items = columnsState[columnName] ?? [];
    const lastOrder = items.length > 0 ? getOrder(items[items.length - 1]) : null;
    const newOrder = generateKeyBetween(lastOrder, null);
    await vaultApi.createTask(vault.path, name, columnName, title, newOrder);
  }

  async function handleRenameColumn(columnName: string, newName: string) {
    if (!vault.path) return;
    if (newName.includes("/") || newName.includes("..")) {
      throw new Error("Column name cannot contain '/' or '..'");
    }
    await vaultApi.renameColumn(vault.path, name, columnName, newName);
    await tasks.loadFromVault(vault.path);
    await boards.load(vault.path);
  }

  function handleDeleteColumn(columnName: string) {
    if (!vault.path) return;
    const cards = columnsState[columnName] ?? [];
    const cardCount = cards.length;
    const detail =
      cardCount > 0
        ? `The column and its ${cardCount} card${cardCount === 1 ? "" : "s"} will be moved to the Trash.`
        : "The column will be moved to the Trash.";
    confirm.ask({
      title: `Delete column "${columnName}"?`,
      message: detail,
      confirmLabel: "Move to Trash",
      danger: true,
      onConfirm: async () => {
        if (!vault.path) return;
        for (const card of cards) {
          tasks.remove(card.path);
        }
        await vaultApi.deleteColumn(vault.path, name, columnName);
        await boards.load(vault.path);
      },
    });
  }
</script>

<div class="flex h-full overflow-x-auto overflow-y-hidden gap-3 p-3">
  {#each columnOrder as colName (colName)}
    <Column
      name={colName}
      items={columnsState[colName] ?? []}
      isDragging={draggingColumn === colName}
      isDragTarget={dragTargetColumn === colName}
      onConsider={(items) => handleConsider(colName, items)}
      onFinalize={(items, info) => handleFinalize(colName, items, info)}
      onHeaderDragStart={(e) => onColumnDragStart(e, colName)}
      onHeaderDragEnd={onColumnDragEnd}
      onHeaderDragOver={(e) => onColumnDragOver(e, colName)}
      onHeaderDragLeave={() => onColumnDragLeave(colName)}
      onHeaderDrop={(e) => onColumnDrop(e, colName)}
      onAddTask={(title) => handleAddTask(colName, title)}
      onDeleteColumn={() => handleDeleteColumn(colName)}
      onRenameColumn={(newName) => handleRenameColumn(colName, newName)}
    />
  {/each}

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    ondragover={onTrailingDragOver}
    ondrop={onTrailingDrop}
    class="w-72 shrink-0 flex flex-col {draggingColumn
      ? 'rounded-md outline-dashed outline-1 outline-fg-faint/30'
      : ''}"
  >
    {#if addingColumn}
      <CreateInput
        placeholder="column name"
        onSubmit={handleCreateColumn}
        onCancel={() => (addingColumn = false)}
      />
    {:else}
      <button
        type="button"
        onclick={() => (addingColumn = true)}
        class="px-3 py-2 rounded-md border border-dashed border-border-strong text-sm text-fg-subtle hover:text-fg hover:border-fg-faint flex items-center justify-center gap-2"
        title="Add column"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4">
          <path d="M12 5v14M5 12h14" stroke-linecap="round" />
        </svg>
        <span>Add column</span>
      </button>
    {/if}
  </div>

  {#if columnOrder.length === 0 && !addingColumn}
    <div class="flex h-full items-center justify-center text-fg-subtle w-full">
      <p>This board has no columns yet.</p>
    </div>
  {/if}
</div>
