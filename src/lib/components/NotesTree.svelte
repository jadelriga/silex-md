<script lang="ts">
  import { page } from "$app/state";
  import { noteHref, decodeNoteRouteParam, type NoteTreeNode } from "$lib/utils/notePath";
  import Self from "./NotesTree.svelte";

  let {
    nodes,
    expanded = $bindable(new Set<string>()),
    depth = 0,
  }: {
    nodes: NoteTreeNode[];
    expanded?: Set<string>;
    depth?: number;
  } = $props();

  const activeRelativePath = $derived(
    page.url.pathname.startsWith("/notes/")
      ? decodeNoteRouteParam(page.url.pathname.slice("/notes/".length))
      : null,
  );

  function toggle(path: string) {
    if (expanded.has(path)) expanded.delete(path);
    else expanded.add(path);
    expanded = new Set(expanded);
  }
</script>

{#each nodes as node (node.relativePath)}
  {#if node.type === "folder"}
    <button
      type="button"
      onclick={() => toggle(node.relativePath)}
      class="w-full text-left px-2 py-0.5 rounded text-neutral-400 hover:bg-neutral-800/60 truncate flex items-center gap-1"
      style="padding-left: {0.5 + depth * 0.75}rem"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        class="w-4 h-4 shrink-0 text-neutral-400 transition-transform {expanded.has(
          node.relativePath,
        )
          ? 'rotate-90'
          : ''}"
      >
        <path d="M9 6 L15 12 L9 18" />
      </svg>
      <span class="truncate">{node.name}</span>
    </button>
    {#if expanded.has(node.relativePath)}
      <Self nodes={node.children} bind:expanded depth={depth + 1} />
    {/if}
  {:else}
    <a
      href={noteHref(node.relativePath)}
      class="block px-2 py-0.5 rounded truncate {activeRelativePath === node.relativePath
        ? 'bg-neutral-800 text-neutral-100'
        : 'text-neutral-300 hover:bg-neutral-800/60'}"
      style="padding-left: {0.5 + (depth + 1) * 0.75}rem"
      title={node.relativePath}
    >
      {node.name}
    </a>
  {/if}
{/each}
