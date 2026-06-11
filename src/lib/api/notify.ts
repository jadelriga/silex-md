import { invoke } from "@tauri-apps/api/core";

export const notifyApi = {
  /** Sends through the native macOS UNUserNotificationCenter path (correct
   * icon + click-to-open). Returns false when unavailable — non-macOS, or a
   * dev binary with no app bundle — so callers can fall back to the
   * notification plugin. */
  native(title: string, body: string, targetPath: string): Promise<boolean> {
    return invoke("notify_native", { title, body, targetPath });
  },
  /** Returns and clears the path of a notification clicked before the
   * frontend was listening (app launched by the click). */
  takePendingClick(): Promise<string | null> {
    return invoke("take_pending_notification_click");
  },
};
