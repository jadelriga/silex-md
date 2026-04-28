<script lang="ts">
  import "../app.css";
  import { ui } from "$lib/stores/ui.svelte";

  let { children } = $props();

  $effect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        ui.terminalOpen = !ui.terminalOpen;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
</script>

<div class="flex flex-col h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-100">
  <div class="flex flex-1 min-h-0">
    <aside class="w-60 shrink-0 border-r border-neutral-800 bg-neutral-900 flex flex-col">
      <div class="px-4 py-3 border-b border-neutral-800">
        <h1 class="text-sm font-semibold tracking-wide">Silex</h1>
      </div>
      <nav class="flex-1 overflow-y-auto p-2 text-sm">
        <div class="px-2 py-1 text-xs uppercase tracking-wide text-neutral-500">Boards</div>
        <div class="px-2 py-1 text-neutral-600 italic">No vault loaded</div>
      </nav>
    </aside>
    <main class="flex-1 overflow-auto">
      {@render children()}
    </main>
  </div>

  {#if ui.terminalOpen}
    <section class="h-60 shrink-0 border-t border-neutral-800 bg-black text-neutral-200 font-mono text-sm flex flex-col">
      <div class="flex items-center justify-between px-3 py-1 border-b border-neutral-800 text-xs text-neutral-500">
        <span>Terminal</span>
        <button
          onclick={() => (ui.terminalOpen = false)}
          class="hover:text-neutral-200"
          aria-label="Close terminal panel"
        >
          close
        </button>
      </div>
      <div class="p-3 text-neutral-500 italic">Terminal will be wired up in step 12.</div>
    </section>
  {/if}
</div>
