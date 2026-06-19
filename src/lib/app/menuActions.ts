import { appDataDir, join } from "@tauri-apps/api/path";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { goto } from "$app/navigation";
import { ui } from "$lib/stores/ui.svelte";
import { vault } from "$lib/stores/vault.svelte";
import { theme } from "$lib/stores/theme.svelte";
import { boards } from "$lib/stores/boards.svelte";
import { checkForUpdates } from "$lib/updater";
import type { MenuActions } from "$lib/utils/menuListener";

export interface MenuActionDeps {
  /** Current board route segment, or null off a board. Passed as a getter
   *  because it's a reactive `$derived` owned by the layout. */
  getActiveBoard: () => string | null;
}

/**
 * Builds the native-menu / accelerator action map consumed by
 * `startMenuListener`. All collaborators are module-level singletons except the
 * reactive `activeBoard`, which arrives via `deps.getActiveBoard`. Behaviour is
 * identical to the map that previously lived inline in `+layout.svelte`.
 */
export function buildMenuActions({ getActiveBoard }: MenuActionDeps): MenuActions {
  return {
    preferences: () => {
      ui.settingsOpen = !ui.settingsOpen;
    },
    "reveal-settings": async () => {
      try {
        const dir = await appDataDir();
        const path = await join(dir, "settings.json");
        await revealItemInDir(path);
      } catch (e) {
        console.error("reveal-settings failed", e);
      }
    },
    "new-task": () => {
      // No active board → no-op (user is on calendar/notes/home/etc.).
      // Otherwise focus the leftmost column's "Add a card" input via
      // the shared ui.addingCardInColumn state.
      const activeBoard = getActiveBoard();
      if (!activeBoard) return;
      const layout = boards.list.find((b) => b.name === activeBoard);
      const leftmost = layout?.columns[0];
      if (leftmost) ui.addingCardInColumn = leftmost;
    },
    "new-note": () => {
      ui.creating = "note";
    },
    "new-board": () => {
      ui.creating = "board";
    },
    "new-folder": () => {
      ui.creating = "folder";
    },
    "new-reminder": () => {
      ui.newReminder = {};
    },
    "open-vault": async () => {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "Choose vault folder",
      });
      if (typeof selected === "string") await vault.set(selected);
    },
    find: () => {
      if (ui.searchOpen) {
        ui.searchOpen = false;
      } else {
        ui.paletteMode = null;
        ui.searchOpen = true;
      }
    },
    palette: () => {
      if (ui.paletteMode === "navigation") {
        ui.paletteMode = null;
      } else {
        ui.searchOpen = false;
        ui.paletteMode = "navigation";
      }
    },
    commands: () => {
      if (ui.paletteMode === "command") {
        ui.paletteMode = null;
      } else {
        ui.searchOpen = false;
        ui.paletteMode = "command";
      }
    },
    "toggle-terminal": () => {
      ui.terminalOpen = !ui.terminalOpen;
    },
    calendar: () => goto("/calendar"),
    "theme-system": () => void theme.setPref("system"),
    "theme-light": () => void theme.setPref("light"),
    "theme-dark": () => void theme.setPref("dark"),
    "check-for-updates": () => void checkForUpdates(),
  };
}
