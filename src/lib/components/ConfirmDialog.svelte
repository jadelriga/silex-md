<script lang="ts">
  import { tick } from "svelte";
  import { confirm } from "$lib/stores/confirm.svelte";

  let busy = $state(false);
  let confirmEl = $state<HTMLButtonElement | undefined>();

  $effect(() => {
    if (confirm.request) {
      busy = false;
      tick().then(() => confirmEl?.focus());
    }
  });

  async function doConfirm() {
    if (!confirm.request || busy) return;
    busy = true;
    try {
      await confirm.request.onConfirm();
      confirm.close();
    } catch (e) {
      console.error("Confirm action failed", e);
      busy = false;
    }
  }

  function close() {
    if (busy) return;
    confirm.close();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Enter") {
      e.preventDefault();
      doConfirm();
    }
  }
</script>

{#if confirm.request}
  {@const r = confirm.request}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-[55] flex items-center justify-center bg-backdrop backdrop-blur-sm"
    onclick={(e) => {
      if (e.target === e.currentTarget) close();
    }}
  >
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="w-[26rem] max-w-[90vw] rounded-lg border border-border bg-surface-1 p-6 shadow-2xl"
      onkeydown={onKey}
    >
      <h2 class="text-lg font-semibold text-fg">{r.title}</h2>
      <p class="mt-2 text-sm leading-relaxed text-fg-muted whitespace-pre-line">{r.message}</p>
      <div class="mt-5 flex items-center justify-end gap-2">
        <button
          type="button"
          onclick={close}
          disabled={busy}
          class="px-3 py-1.5 text-sm text-fg-muted hover:text-fg"
        >
          {r.cancelLabel ?? "Cancel"}
        </button>
        <button
          bind:this={confirmEl}
          type="button"
          onclick={doConfirm}
          disabled={busy}
          class="px-3 py-1.5 rounded text-sm {r.danger
            ? 'bg-red-500 text-white hover:bg-red-600'
            : 'bg-accent text-accent-fg hover:bg-accent-hover'} disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Working…" : (r.confirmLabel ?? "Confirm")}
        </button>
      </div>
    </div>
  </div>
{/if}
