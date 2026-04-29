<script lang="ts">
  import { generateKeyBetween } from "fractional-indexing";
  import { tasks } from "$lib/stores/tasks.svelte";
  import { boards } from "$lib/stores/boards.svelte";
  import { vault } from "$lib/stores/vault.svelte";
  import { vaultApi, type VaultEntry } from "$lib/api/vault";
  import { sortCards, getOrder } from "$lib/utils/order";
  import { buildTaskContent } from "$lib/utils/yaml";
  import Column from "./Column.svelte";

  let { name }: { name: string } = $props();

  type CardItem = VaultEntry & { id: string };

  let columnsState = $state<Record<string, CardItem[]>>({});

  $effect(() => {
    const grouped: Record<string, CardItem[]> = {};
    const layout = boards.list.find((b) => b.name === name);
    if (layout) {
      for (const col of layout.columns) {
        grouped[col] = [];
      }
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
  });

  const columnNames = $derived(Object.keys(columnsState).sort());

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
</script>

<div class="flex h-full overflow-x-auto overflow-y-hidden gap-3 p-3">
  {#each columnNames as colName (colName)}
    <Column
      name={colName}
      items={columnsState[colName] ?? []}
      onConsider={(items) => handleConsider(colName, items)}
      onFinalize={(items, info) => handleFinalize(colName, items, info)}
    />
  {/each}
  {#if columnNames.length === 0}
    <div class="flex h-full items-center justify-center text-fg-subtle w-full">
      <p>This board has no columns yet.</p>
    </div>
  {/if}
</div>
