export type CreatingKind = "board" | "note" | "folder" | null;

export interface NotesDrag {
  path: string;
  relativePath: string;
}

export interface NewReminderState {
  date?: string;
  time?: string;
}

class UiStore {
  terminalOpen = $state(false);
  activeBoard = $state<string | null>(null);
  openTaskPath = $state<string | null>(null);
  paletteOpen = $state(false);
  searchOpen = $state(false);
  creating = $state<CreatingKind>(null);
  notesDrag = $state<NotesDrag | null>(null);
  notesDragOver = $state<string | null>(null);
  newReminder = $state<NewReminderState | null>(null);
}

export const ui = new UiStore();
