<script lang="ts">
  import { vault } from "$lib/stores/vault.svelte";
</script>

<div class="flex h-full items-center justify-center">
  <div class="text-center">
    <h2 class="text-2xl font-light text-neutral-300">Silex</h2>
    {#if vault.path}
      <p class="mt-2 text-sm text-neutral-500">
        Vault: <code class="text-neutral-400">{vault.path}</code>
      </p>
      <p class="mt-2 text-xs text-neutral-600">Board view coming in step 7.</p>
    {/if}
    <p class="mt-4 text-xs text-neutral-600">
      Press <kbd class="px-1.5 py-0.5 rounded border border-neutral-700 bg-neutral-900 font-mono">⌘ J</kbd> to toggle the terminal panel.
    </p>
  </div>
</div>
