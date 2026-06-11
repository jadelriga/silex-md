import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { goto } from "$app/navigation";
import { ui } from "$lib/stores/ui.svelte";
import { vault } from "$lib/stores/vault.svelte";
import { notifyApi } from "$lib/api/notify";
import { noteHref, noteRelativePath } from "$lib/utils/notePath";

/** Opens the entry a notification points at: tasks get their board route +
 * detail panel, reminders (and anything else) open in the note view. */
export function openNotificationTarget(path: string) {
  if (!vault.path || !path.startsWith(`${vault.path}/`)) return;
  const boardsPrefix = `${vault.path}/boards/`;
  if (path.startsWith(boardsPrefix)) {
    const board = path.slice(boardsPrefix.length).split("/")[0];
    void goto(`/boards/${encodeURIComponent(board)}`);
    ui.openTaskPath = path;
  } else {
    void goto(noteHref(noteRelativePath(path, vault.path)));
  }
}

/** Live clicks while the app is running. The pending slot is cleared so a
 * click handled here isn't replayed from `consumePendingNotificationClick`
 * on the next launch. */
export function startNotificationClickListener(): Promise<UnlistenFn> {
  return listen<string>("notification:clicked", (e) => {
    void notifyApi.takePendingClick().catch(() => {});
    openNotificationTarget(e.payload);
  });
}

/** Cold-start case: the click launched the app before the frontend could
 * listen, so the Rust side parked the path for us. */
export async function consumePendingNotificationClick() {
  try {
    const path = await notifyApi.takePendingClick();
    if (path) openNotificationTarget(path);
  } catch {
    // Native side unavailable (non-macOS or dev binary) — nothing pending.
  }
}
