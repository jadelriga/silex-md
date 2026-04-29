<script lang="ts">
  import NoteView from "$lib/components/NoteView.svelte";
  import { page } from "$app/state";
  import { vault } from "$lib/stores/vault.svelte";
  import { decodeNoteRouteParam } from "$lib/utils/notePath";

  const fullPath = $derived.by(() => {
    const param = page.params.path;
    if (!vault.path || !param) return null;
    const rel = decodeNoteRouteParam(param);
    return `${vault.path}/${rel}`;
  });
</script>

{#if fullPath}
  <NoteView path={fullPath} />
{:else}
  <div class="p-6 text-fg-subtle">No note selected.</div>
{/if}
