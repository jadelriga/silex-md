export type CreatingKind = "board" | "note" | "folder" | null;

export interface NotesDrag {
  path: string;
  relativePath: string;
}

export interface NewReminderState {
  date?: string;
  time?: string;
}

export type PaletteMode = "navigation" | "command" | null;

class UiStore {
  terminalOpen = $state(false);
  activeBoard = $state<string | null>(null);
  openTaskPath = $state<string | null>(null);
  paletteMode = $state<PaletteMode>(null);
  searchOpen = $state(false);
  settingsOpen = $state(false);
  creating = $state<CreatingKind>(null);
  addingCardInColumn = $state<string | null>(null);
  notesDrag = $state<NotesDrag | null>(null);
  notesDragOver = $state<string | null>(null);
  newReminder = $state<NewReminderState | null>(null);
}

export const ui = new UiStore();
