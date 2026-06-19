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
  import { buildMenuActions } from "$lib/app/menuActions";
  import { startResizeDrag } from "$lib/utils/dragToResize";
  import { startScheduler, stopScheduler, runCheckNow } from "$lib/scheduler";
  import { checkForUpdates } from "$lib/updater";
  import Sidebar from "$lib/components/Sidebar.svelte";
  import VaultSetup from "$lib/components/VaultSetup.svelte";
  import TaskDetailPanel from "$lib/components/TaskDetailPanel.svelte";
  import NewReminderDialog from "$lib/components/NewReminderDialog.svelte";
  import Terminal from "$lib/components/Terminal.svelte";
  import CommandPalette from "$lib/components/CommandPalette.svelte";
  import SearchOverlay from "$lib/components/SearchOverlay.svelte";
  import ContextMenu from "$lib/components/ContextMenu.svelte";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
  import SettingsModal from "$lib/components/SettingsModal.svelte";
  import Toast from "$lib/components/Toast.svelte";
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
    startResizeDrag(e, {
      axis: "x",
      start: settings.taskPanelWidth,
      clamp: (v) => Math.max(320, Math.min(window.innerWidth - 240, v)),
      apply: (v) => (settings.taskPanelWidth = v),
      commit: (v) => void settings.setTaskPanelWidth(v),
    });
  }

  function startTerminalResize(e: MouseEvent) {
    startResizeDrag(e, {
      axis: "y",
      start: settings.terminalHeight,
      clamp: (v) => Math.max(80, Math.min(window.innerHeight - 120, v)),
      apply: (v) => (settings.terminalHeight = v),
      commit: (v) => void settings.setTerminalHeight(v),
    });
  }

  const activeBoard = $derived(
    page.url.pathname.startsWith("/boards/")
      ? decodeURIComponent(page.url.pathname.slice("/boards/".length).split("/")[0])
      : null,
  );

  let { children } = $props();

  onMount(() => {
    vault.load();
    void theme.load();
    void settings.load();
    void checkForUpdates({ silent: true });
    let unlistenSync: UnlistenFn | null = null;
    let unlistenMenu: UnlistenFn | null = null;
    startSync().then((u) => (unlistenSync = u));
    startMenuListener(buildMenuActions({ getActiveBoard: () => activeBoard })).then(
      (u) => (unlistenMenu = u),
    );
    return () => {
      unlistenSync?.();
      unlistenMenu?.();
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
      untrack(() => runCheckNow());
    }
  });

  $effect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && ui.openTaskPath && ui.paletteMode === null && !ui.searchOpen) {
        ui.openTaskPath = null;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  function basename(p: string) {
    return p.split("/").filter(Boolean).pop() ?? p;
  }
</script>

<div class="flex flex-col h-screen w-screen overflow-hidden bg-surface text-fg">
  <!-- Custom title bar: draggable across the whole window, themed, leaves room for macOS traffic lights -->
  <div
    class="h-8 shrink-0 flex items-center border-b border-border bg-surface-1 select-none"
    data-tauri-drag-region
  >
    <div class="w-20 shrink-0" data-tauri-drag-region></div>
    <div class="flex-1 px-3 text-xs text-fg-subtle truncate" data-tauri-drag-region>
      Silex{vault.path ? ` — ${basename(vault.path)}` : ""}
    </div>
  </div>

  <div class="flex flex-1 min-h-0">
    <Sidebar {activeBoard} />
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
          <div
            class="flex items-center justify-between px-3 py-1 border-b border-border text-xs text-fg-subtle"
          >
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
