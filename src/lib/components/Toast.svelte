<script lang="ts">
  import { toast } from "$lib/stores/toast.svelte";
  import { fly } from "svelte/transition";
</script>

{#if toast.message}
  <div
    class="fixed bottom-6 right-6 z-[60] bg-surface-2 text-fg border border-border-strong rounded px-4 py-2 text-sm shadow-2xl pointer-events-none"
    transition:fly={{ y: 12, duration: 180 }}
  >
    {toast.message}
  </div>
{/if}
