export interface ContextMenuItem {
  label: string;
  action: () => void | Promise<void>;
  danger?: boolean;
  disabled?: boolean;
}

export type ContextMenuEntry = ContextMenuItem | "separator";

export interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuEntry[];
}

class ContextMenuStore {
  state = $state<ContextMenuState | null>(null);

  open(x: number, y: number, items: ContextMenuEntry[]) {
    if (items.length === 0) return;
    this.state = { x, y, items };
  }

  close() {
    this.state = null;
  }
}

export const contextMenu = new ContextMenuStore();
