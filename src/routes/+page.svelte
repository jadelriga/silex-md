<script lang="ts">
  import { vault } from "$lib/stores/vault.svelte";
</script>

<div class="flex h-full items-center justify-center">
  <div class="text-center">
    <h2 class="text-2xl font-light text-fg">Silex</h2>
    {#if vault.path}
      <p class="mt-2 text-sm text-fg-subtle">
        Vault: <code class="text-fg-muted">{vault.path}</code>
      </p>
      <p class="mt-2 text-xs text-fg-faint">Board view coming in step 7.</p>
    {/if}
    <p class="mt-4 text-xs text-fg-faint">
      Press <kbd class="px-1.5 py-0.5 rounded border border-border-strong bg-surface-1 font-mono">⌘ J</kbd> to toggle the terminal panel.
    </p>
  </div>
</div>
