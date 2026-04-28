<script lang="ts">
  import Board from "$lib/components/Board.svelte";
  import { page } from "$app/state";

  const boardName = $derived(decodeURIComponent(page.params.board ?? ""));
</script>

<Board name={boardName} />
