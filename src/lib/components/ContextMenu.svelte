<script lang="ts">
  import { tick } from "svelte";
  import { contextMenu } from "$lib/stores/contextMenu.svelte";
  import { clickOutside } from "$lib/utils/clickOutside";

  let menuEl = $state<HTMLDivElement | undefined>();
  let pos = $state<{ left: string; top: string }>({ left: "0px", top: "0px" });

  $effect(() => {
    const state = contextMenu.state;
    if (!state) return;
    tick().then(() => {
      if (!menuEl) return;
      const rect = menuEl.getBoundingClientRect();
      const margin = 8;
      let x = state.x;
      let y = state.y;
      if (x + rect.width + margin > window.innerWidth) {
        x = Math.max(margin, window.innerWidth - rect.width - margin);
      }
      if (y + rect.height + margin > window.innerHeight) {
        y = Math.max(margin, window.innerHeight - rect.height - margin);
      }
      pos = { left: `${x}px`, top: `${y}px` };
    });
  });

  async function run(action: () => void | Promise<void>, disabled?: boolean) {
    if (disabled) return;
    contextMenu.close();
    try {
      await action();
    } catch (e) {
      console.error("Context menu action failed", e);
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      contextMenu.close();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

{#if contextMenu.state}
  <div
    bind:this={menuEl}
    use:clickOutside={{ callback: () => contextMenu.close() }}
    class="fixed z-[60] min-w-[10rem] max-w-[18rem] rounded-md border border-border bg-surface-1 shadow-2xl py-1 text-sm"
    style:left={pos.left}
    style:top={pos.top}
  >
    {#each contextMenu.state.items as item, i (i)}
      {#if item === "separator"}
        <div class="my-1 border-t border-border"></div>
      {:else}
        <button
          type="button"
          disabled={item.disabled}
          onclick={(e) => {
            e.stopPropagation();
            run(item.action, item.disabled);
          }}
          class="w-full text-left px-3 py-1.5 truncate {item.danger
            ? 'text-red-400 hover:bg-red-500/15'
            : 'text-fg hover:bg-surface-2'} disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {item.label}
        </button>
      {/if}
    {/each}
  </div>
{/if}
