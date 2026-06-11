<script lang="ts">
  import "../app.css";
  import { onMount, untrack } from "svelte";
  import { page } from "$app/state";
  import { ui } from "$lib/stores/ui.svelte";
  import { vault } from "$lib/stores/vault.svelte";
  import { tasks } from "$lib/stores/tasks.svelte";
  import { boards } from "$lib/stores/boards.svelte";
  import { notes } from "$lib/stores/notes.svelte";
  import { reminders } from "$lib/stores/reminders.svelte";
  import { theme } from "$lib/stores/theme.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import { vaultApi } from "$lib/api/vault";
  import { startSync } from "$lib/sync";
  import { startMenuListener } from "$lib/utils/menuListener";
  import { startScheduler, stopScheduler, runCheckNow } from "$lib/scheduler";
  import {
    startNotificationClickListener,
    consumePendingNotificationClick,
  } from "$lib/notifyClick";
  import { checkForUpdates } from "$lib/updater";
  import { startEdgeResize } from "$lib/utils/panelResize";
  import { activeBoardFromPathname, basename } from "$lib/utils/routes";
  import VaultSetup from "$lib/components/VaultSetup.svelte";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import TaskDetailPanel from "$lib/components/TaskDetailPanel.svelte";
  import NewReminderDialog from "$lib/components/NewReminderDialog.svelte";
  import Terminal from "$lib/components/Terminal.svelte";
  import CommandPalette from "$lib/components/CommandPalette.svelte";
  import SearchOverlay from "$lib/components/SearchOverlay.svelte";
  import ContextMenu from "$lib/components/ContextMenu.svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
  import SettingsModal from "$lib/components/SettingsModal.svelte";
  import Toast from "$lib/components/Toast.svelte";
  import { revealItemInDir } from "@tauri-apps/plugin-opener";
  import { appDataDir, join } from "@tauri-apps/api/path";
  import { goto } from "$app/navigation";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import { fly } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import type { UnlistenFn } from "@tauri-apps/api/event";

  let terminalEverOpened = $state(false);
  let taskPanelMaximized = $state(false);

  $effect(() => {
    if (ui.terminalOpen) terminalEverOpened = true;
  });

  // Reset maximize on each new task open so every panel session starts at
  // the persisted width.
  $effect(() => {
    void ui.openTaskPath;
    untrack(() => (taskPanelMaximized = false));
  });

  function startTaskPanelResize(e: MouseEvent) {
    startEdgeResize(e, {
      axis: "x",
      startSize: settings.taskPanelWidth,
      min: 320,
      max: window.innerWidth - 240,
      onResize: (w) => (settings.taskPanelWidth = w),
      onDone: (w) => void settings.setTaskPanelWidth(w),
    });
  }

  function startTerminalResize(e: MouseEvent) {
    startEdgeResize(e, {
      axis: "y",
      startSize: settings.terminalHeight,
      min: 80,
      max: window.innerHeight - 120,
      onResize: (h) => (settings.terminalHeight = h),
      onDone: (h) => void settings.setTerminalHeight(h),
    });
  }

  const activeBoard = $derived(activeBoardFromPathname(page.url.pathname));

  let { children } = $props();

  onMount(() => {
    vault.load();
    void theme.load();
    void settings.load();
    void checkForUpdates({ silent: true });
    let unlistenSync: UnlistenFn | null = null;
    let unlistenMenu: UnlistenFn | null = null;
    let unlistenNotify: UnlistenFn | null = null;
    startSync().then((u) => (unlistenSync = u));
    startNotificationClickListener().then((u) => (unlistenNotify = u));
    startMenuListener({
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
    }).then((u) => (unlistenMenu = u));
    return () => {
      unlistenSync?.();
      unlistenMenu?.();
      unlistenNotify?.();
      stopScheduler();
    };
  });

  $effect(() => {
    // re-runs whenever theme.effective changes
    void theme.effective;
    untrack(() => theme.applyToDocument());
  });

  $effect(() => {
    if (vault.path) {
      tasks.loadFromVault(vault.path);
      notes.loadFromVault(vault.path);
      reminders.loadFromVault(vault.path);
      boards.load(vault.path);
      vaultApi.watchVault(vault.path).catch((e) => console.error("watch_vault failed", e));
      untrack(() => startScheduler());
    }
  });

  $effect(() => {
    if (tasks.isLoaded && vault.path) {
      untrack(() => {
        void runCheckNow();
        // If a notification click launched the app, the Rust side parked
        // the target path; open it now that the stores can resolve it.
        void consumePendingNotificationClick();
      });
    }
  });

  $effect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        ui.openTaskPath &&
        ui.paletteMode === null &&
        !ui.searchOpen
      ) {
        ui.openTaskPath = null;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
</script>

<div class="flex flex-col h-screen w-screen overflow-hidden bg-surface text-fg">
  <!-- Custom title bar: draggable across the whole window, themed, leaves room for macOS traffic lights -->
  <div
    class="h-8 shrink-0 flex items-center border-b border-border bg-surface-1 select-none"
    data-tauri-drag-region
  >
    <div class="w-20 shrink-0" data-tauri-drag-region></div>
    <div
      class="flex-1 px-3 text-xs text-fg-subtle truncate"
      data-tauri-drag-region
    >
      Silex{vault.path ? ` — ${basename(vault.path)}` : ""}
    </div>
  </div>

  <div class="flex flex-1 min-h-0">
    <Sidebar />
    <div class="flex-1 flex flex-col min-w-0">
      <main class="flex-1 overflow-auto flex flex-col min-h-0">
        {@render children()}
      </main>

      <!-- Terminal panel: mounted once on first open and hidden via
           display:none on subsequent toggles, so the PTY survives Cmd+J
           without restarting the shell. Lives in the right-of-sidebar
           column so the panel doesn't bleed under the sidebar. -->
      {#if terminalEverOpened}
        <section
          class:hidden={!ui.terminalOpen}
          class="shrink-0 border-t border-border bg-surface-deep text-fg font-mono text-sm flex flex-col"
          style="height: {settings.terminalHeight}px"
        >
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <div
            role="separator"
            aria-orientation="horizontal"
            onmousedown={startTerminalResize}
            class="h-1 -mt-0.5 cursor-ns-resize hover:bg-surface-3 shrink-0"
          ></div>
          <div class="flex items-center justify-between px-3 py-1 border-b border-border text-xs text-fg-subtle">
            <span>Terminal</span>
            <button
              onclick={() => (ui.terminalOpen = false)}
              class="hover:text-fg"
              aria-label="Close terminal panel"
            >
              close
            </button>
          </div>
          <div class="flex-1 min-h-0">
            <Terminal />
          </div>
        </section>
      {/if}
    </div>
  </div>
</div>

{#if vault.isLoaded && !vault.path}
  <VaultSetup />
{/if}

<CommandPalette />
<SearchOverlay />
<NewReminderDialog />
<ContextMenu />
<ConfirmDialog />
<SettingsModal />
<Toast />

{#if ui.openTaskPath}
  <div
    class="fixed right-0 top-8 bottom-0 z-40 flex {taskPanelMaximized ? 'left-60' : ''}"
    style={taskPanelMaximized ? "" : `width: ${settings.taskPanelWidth}px`}
    transition:fly={{ x: 640, duration: 220, easing: quintOut }}
  >
    {#if !taskPanelMaximized}
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div
        role="separator"
        aria-orientation="vertical"
        onmousedown={startTaskPanelResize}
        onclick={(e) => e.stopPropagation()}
        class="w-1 -mr-0.5 cursor-ew-resize hover:bg-surface-3 shrink-0 z-10"
      ></div>
    {/if}
    <div class="flex-1 min-w-0">
      {#key ui.openTaskPath}
        <TaskDetailPanel
          path={ui.openTaskPath}
          maximized={taskPanelMaximized}
          onMaximizeToggle={() => (taskPanelMaximized = !taskPanelMaximized)}
        />
      {/key}
    </div>
  </div>
{/if}
