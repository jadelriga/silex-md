<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen, type UnlistenFn } from "@tauri-apps/api/event";
  import { vault } from "$lib/stores/vault.svelte";
  import "@xterm/xterm/css/xterm.css";

  let container: HTMLDivElement;
  let term: import("@xterm/xterm").Terminal | null = null;
  let fitAddon: import("@xterm/addon-fit").FitAddon | null = null;
  let sessionId: string | null = null;
  let unlistenOutput: UnlistenFn | null = null;
  let unlistenExit: UnlistenFn | null = null;
  let resizeObserver: ResizeObserver | null = null;

  function fit() {
    try {
      fitAddon?.fit();
    } catch {
      // ignore (container may be 0-sized briefly)
    }
  }

  onMount(async () => {
    const xterm = await import("@xterm/xterm");
    const fitMod = await import("@xterm/addon-fit");

    term = new xterm.Terminal({
      theme: {
        background: "#000000",
        foreground: "#e5e5e5",
        cursor: "#e5e5e5",
        selectionBackground: "#404040",
      },
      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
      fontSize: 13,
      cursorBlink: true,
      convertEol: true,
    });
    fitAddon = new fitMod.FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    fit();

    try {
      sessionId = await invoke<string>("spawn_shell", {
        cwd: vault.path ?? null,
      });
    } catch (err) {
      term.writeln(`\r\n[silex] failed to spawn shell: ${String(err)}`);
      return;
    }

    const idAtMount = sessionId;

    unlistenOutput = await listen<{ id: string; data: string }>(
      "shell:output",
      (event) => {
        if (event.payload.id !== idAtMount) return;
        term?.write(event.payload.data);
      },
    );

    unlistenExit = await listen<{ id: string }>("shell:exit", (event) => {
      if (event.payload.id !== idAtMount) return;
      term?.writeln("\r\n[silex] shell exited.");
    });

    term.onData((data) => {
      if (!sessionId) return;
      invoke("shell_input", { sessionId, data }).catch((e) =>
        console.error("shell_input failed", e),
      );
    });

    term.onResize(({ cols, rows }) => {
      if (!sessionId) return;
      invoke("shell_resize", { sessionId, cols, rows }).catch(() => {});
    });

    resizeObserver = new ResizeObserver(() => fit());
    resizeObserver.observe(container);

    setTimeout(() => term?.focus(), 0);
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    unlistenOutput?.();
    unlistenExit?.();
    if (sessionId) {
      invoke("shell_kill", { sessionId }).catch(() => {});
    }
    term?.dispose();
    term = null;
    fitAddon = null;
    sessionId = null;
  });
</script>

<div bind:this={container} class="h-full w-full bg-surface-deep"></div>
