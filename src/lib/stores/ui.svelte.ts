export type CreatingKind = "board" | "note" | "folder" | null;

class UiStore {
  terminalOpen = $state(false);
  activeBoard = $state<string | null>(null);
  openTaskPath = $state<string | null>(null);
  paletteOpen = $state(false);
  searchOpen = $state(false);
  creating = $state<CreatingKind>(null);
}

export const ui = new UiStore();
