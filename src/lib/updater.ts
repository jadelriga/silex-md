import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { confirm } from "$lib/stores/confirm.svelte";
import { toast } from "$lib/stores/toast.svelte";

/**
 * Check GitHub Releases for a newer version and offer to install it.
 *
 * `silent: true` is the launch-time mode: no "up to date" toast and network
 * failures (offline, GitHub down) stay quiet. The menu-triggered check is
 * interactive and reports both outcomes.
 */
export async function checkForUpdates(opts: { silent?: boolean } = {}): Promise<void> {
  let update;
  try {
    update = await check();
  } catch (e) {
    console.error("update check failed", e);
    if (!opts.silent) toast.show("Update check failed");
    return;
  }

  if (!update) {
    if (!opts.silent) toast.show("Silex is up to date");
    return;
  }

  const { version, body } = update;
  confirm.ask({
    title: `Update available — v${version}`,
    message: body?.trim() || `Silex v${version} is ready to download and install.`,
    confirmLabel: "Install & Relaunch",
    cancelLabel: "Later",
    onConfirm: async () => {
      try {
        let total = 0;
        let downloaded = 0;
        let lastPercent = -1;
        toast.show("Downloading update…", 120_000);
        await update.downloadAndInstall((event) => {
          if (event.event === "Started") {
            total = event.data.contentLength ?? 0;
          } else if (event.event === "Progress" && total > 0) {
            downloaded += event.data.chunkLength;
            const percent = Math.min(100, Math.round((downloaded / total) * 100));
            // Only touch state when the integer percent moves — Progress
            // fires per chunk, far more often than the label changes.
            if (percent !== lastPercent) {
              lastPercent = percent;
              toast.show(`Downloading update… ${percent}%`, 120_000);
            }
          } else if (event.event === "Finished") {
            toast.show("Installing update…", 120_000);
          }
        });
        await relaunch();
      } catch (e) {
        console.error("update install failed", e);
        toast.show("Update failed — see console for details", 5000);
      }
    },
  });
}
