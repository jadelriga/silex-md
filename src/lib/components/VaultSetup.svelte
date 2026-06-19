<script lang="ts">
  import { open } from "@tauri-apps/plugin-dialog";
  import { vault } from "$lib/stores/vault.svelte";

  let busy = $state(false);
  let error = $state<string | null>(null);

  async function chooseVault() {
    busy = true;
    error = null;
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Choose vault folder",
      });
      if (typeof selected === "string") {
        await vault.set(selected);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center bg-backdrop backdrop-blur-sm">
  <div class="w-[28rem] rounded-lg border border-border bg-surface-1 p-6 shadow-2xl">
    <h2 class="text-lg font-semibold text-fg">Welcome to Silex</h2>
    <p class="mt-2 text-sm leading-relaxed text-fg-muted">
      Choose a folder to use as your vault. All your boards and notes will live there as Markdown
      files. You can change this later from settings.
    </p>
    <button
      onclick={chooseVault}
      disabled={busy}
      class="mt-5 w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? "Opening folder picker…" : "Choose vault folder"}
    </button>
    {#if error}
      <p class="mt-3 text-xs text-red-400">{error}</p>
    {/if}
  </div>
</div>
