class UiStore {
  terminalOpen = $state(false);
  activeBoard = $state<string | null>(null);
  openTaskPath = $state<string | null>(null);
  paletteOpen = $state(false);
  searchOpen = $state(false);
}

export const ui = new UiStore();
