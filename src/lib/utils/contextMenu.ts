import { contextMenu, type ContextMenuEntry } from "$lib/stores/contextMenu.svelte";

export function withContextMenu(
  node: HTMLElement,
  getItems: () => ContextMenuEntry[] | null | undefined,
) {
  let current = getItems;

  const handler = (e: MouseEvent) => {
    const items = current();
    if (!items || items.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    contextMenu.open(e.clientX, e.clientY, items);
  };

  node.addEventListener("contextmenu", handler);

  return {
    update(next: () => ContextMenuEntry[] | null | undefined) {
      current = next;
    },
    destroy() {
      node.removeEventListener("contextmenu", handler);
    },
  };
}
