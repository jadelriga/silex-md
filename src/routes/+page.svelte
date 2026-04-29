<script lang="ts">
  import { vault } from "$lib/stores/vault.svelte";

  const ascii = ` ███████╗██╗██╗     ███████╗██╗  ██╗
 ██╔════╝██║██║     ██╔════╝╚██╗██╔╝
███████╗██║██║     █████╗   ╚███╔╝
╚════██║██║██║     ██╔══╝   ██╔██╗
 ███████║██║███████╗███████╗██╔╝ ██╗
 ╚══════╝╚═╝╚══════╝╚══════╝╚═╝  ╚═╝`;
</script>

<div class="flex h-full items-center justify-center px-6">
  <div class="text-center">
    <pre
      class="text-fg select-none whitespace-pre"
      style="font-family: Menlo, 'SF Mono', 'Liberation Mono', monospace; font-size: 0.75rem; line-height: 0.75rem; font-feature-settings: 'liga' 0, 'calt' 0;"
      aria-label="Silex"
    >{ascii}</pre>

    {#if vault.path}
      <p class="mt-6 text-sm text-fg-subtle">
        Vault <code class="text-fg-muted">{vault.path}</code>
      </p>
    {/if}

    <div class="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-fg-faint">
      <span>
        <kbd
          class="px-1.5 py-0.5 rounded border border-border-strong bg-surface-1 font-mono"
        >⌘ P</kbd>
        command palette
      </span>
      <span>
        <kbd
          class="px-1.5 py-0.5 rounded border border-border-strong bg-surface-1 font-mono"
        >⌘ ⇧ F</kbd>
        search
      </span>
      <span>
        <kbd
          class="px-1.5 py-0.5 rounded border border-border-strong bg-surface-1 font-mono"
        >⌘ J</kbd>
        terminal
      </span>
    </div>
  </div>
</div>
