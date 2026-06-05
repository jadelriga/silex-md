import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type MenuActionId =
  | "preferences"
  | "reveal-settings"
  | "new-task"
  | "new-note"
  | "new-board"
  | "new-folder"
  | "new-reminder"
  | "open-vault"
  | "find"
  | "palette"
  | "commands"
  | "toggle-terminal"
  | "calendar"
  | "theme-system"
  | "theme-light"
  | "theme-dark"
  | "check-for-updates";

export type MenuActions = Partial<Record<MenuActionId, () => void | Promise<void>>>;

export async function startMenuListener(actions: MenuActions): Promise<UnlistenFn> {
  const unlisteners: UnlistenFn[] = [];
  for (const [id, handler] of Object.entries(actions)) {
    if (!handler) continue;
    const u = await listen(`menu:${id}`, () => {
      void handler();
    });
    unlisteners.push(u);
  }
  return () => {
    for (const u of unlisteners) u();
  };
}
