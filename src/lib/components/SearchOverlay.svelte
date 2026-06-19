<script lang="ts">
  import { tick } from "svelte";
  import { goto } from "$app/navigation";
  import { ui } from "$lib/stores/ui.svelte";
  import { tasks } from "$lib/stores/tasks.svelte";
  import { notes } from "$lib/stores/notes.svelte";
  import { boards } from "$lib/stores/boards.svelte";
  import { vault } from "$lib/stores/vault.svelte";
  import { bodies } from "$lib/stores/bodies.svelte";
  import {
    searchEntries,
    highlightMatches,
    queryTokens,
    type Priority,
    type ReminderRange,
    type SearchFilters,
    type SearchHit,
  } from "$lib/utils/search";
  import { noteHref, noteRelativePath } from "$lib/utils/notePath";
  import FilterChip from "./FilterChip.svelte";

  let query = $state("");
  let selectedIndex = $state(0);
  let inputEl = $state<HTMLInputElement | undefined>();
  let filters = $state<SearchFilters>({});
  let openChipId = $state<string | null>(null);

  function chipToggler(id: string) {
    return (next: boolean) => {
      openChipId = next ? id : openChipId === id ? null : openChipId;
    };
  }

  const allEntries = $derived([
    ...Array.from(tasks.entries.values()),
    ...Array.from(notes.entries.values()),
  ]);

  const allTags = $derived.by(() => {
    const set = new Set<string>();
    for (const e of allEntries) {
      const tags = ((e.frontmatter ?? {}) as Record<string, unknown>).tags as string[] | undefined;
      if (tags) for (const t of tags) if (typeof t === "string") set.add(t);
    }
    return Array.from(set).sort();
  });

  const hits = $derived<SearchHit[]>(searchEntries(allEntries, bodies.cache, query, filters));

  const tokens = $derived(queryTokens(query));

  const boardOptions = $derived(boards.list.map((b) => ({ value: b.name, label: b.name })));
  const tagOptions = $derived(allTags.map((t) => ({ value: t, label: t })));
  const kindOptions = [
    { value: "task", label: "Task" },
    { value: "note", label: "Note" },
  ];
  const priorityOptions = [
    { value: "high", label: "High" },
    { value: "medium", label: "Medium" },
    { value: "low", label: "Low" },
  ];
  const reminderOptions = [
    { value: "overdue", label: "Overdue" },
    { value: "today", label: "Today" },
    { value: "this-week", label: "This week" },
    { value: "none", label: "No reminder" },
  ];

  $effect(() => {
    if (selectedIndex >= hits.length) selectedIndex = 0;
  });

  $effect(() => {
    if (ui.searchOpen) {
      query = "";
      filters = {};
      openChipId = null;
      selectedIndex = 0;
      tick().then(() => inputEl?.focus());
      if (vault.path && !bodies.isLoaded && !bodies.isLoading) {
        void bodies.ensureLoaded(vault.path);
      }
    }
  });

  function close() {
    ui.searchOpen = false;
  }

  function open(hit: SearchHit) {
    if (hit.kind === "task") {
      ui.openTaskPath = hit.path;
    } else if (vault.path) {
      const rel = noteRelativePath(hit.path, vault.path);
      goto(noteHref(rel));
    }
    close();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (hits.length === 0) return;
      selectedIndex = (selectedIndex + 1) % hits.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (hits.length === 0) return;
      selectedIndex = (selectedIndex - 1 + hits.length) % hits.length;
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[selectedIndex];
      if (hit) open(hit);
    }
  }

  const kindColor: Record<SearchHit["kind"], string> = {
    task: "text-amber-400",
    note: "text-emerald-400",
  };
</script>

{#if ui.searchOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-backdrop backdrop-blur-sm"
    onclick={(e) => {
      if (e.target === e.currentTarget) close();
    }}
  >
    <div class="w-[48rem] max-w-[92vw] rounded-lg border border-border bg-surface-1 shadow-2xl">
      <input
        bind:this={inputEl}
        bind:value={query}
        onkeydown={onKeydown}
        placeholder="Search across titles, frontmatter, and bodies…"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        class="w-full bg-transparent px-4 py-3 text-sm text-fg outline-none border-b border-border placeholder:text-fg-faint"
      />
      <div class="px-3 py-2 border-b border-border flex flex-wrap gap-2">
        <FilterChip
          label="Board"
          options={boardOptions}
          value={filters.board}
          open={openChipId === "board"}
          onOpenChange={chipToggler("board")}
          onChange={(v) => (filters = { ...filters, board: v as string | undefined })}
        />
        <FilterChip
          label="Kind"
          options={kindOptions}
          value={filters.kind}
          open={openChipId === "kind"}
          onOpenChange={chipToggler("kind")}
          onChange={(v) => (filters = { ...filters, kind: v as "task" | "note" | undefined })}
        />
        <FilterChip
          label="Priority"
          options={priorityOptions}
          multi
          value={filters.priorities}
          open={openChipId === "priority"}
          onOpenChange={chipToggler("priority")}
          onChange={(v) => (filters = { ...filters, priorities: v as Priority[] | undefined })}
        />
        <FilterChip
          label="Tags"
          options={tagOptions}
          multi
          value={filters.tags}
          open={openChipId === "tags"}
          onOpenChange={chipToggler("tags")}
          onChange={(v) => (filters = { ...filters, tags: v as string[] | undefined })}
        />
        <FilterChip
          label="Reminder"
          options={reminderOptions}
          value={filters.reminderRange}
          open={openChipId === "reminder"}
          onOpenChange={chipToggler("reminder")}
          onChange={(v) =>
            (filters = { ...filters, reminderRange: v as ReminderRange | undefined })}
        />
      </div>
      <div class="max-h-[60vh] overflow-y-auto py-1">
        {#if hits.length === 0 && !query.trim() && Object.values(filters).every((v) => !v || (Array.isArray(v) && v.length === 0))}
          <div class="px-4 py-3 text-sm text-fg-subtle italic">
            {#if bodies.isLoading}
              Indexing bodies…
            {:else if !bodies.isLoaded}
              Type or apply a filter to start searching.
            {:else}
              Type or apply a filter to start searching ({bodies.cache.size} files indexed).
            {/if}
          </div>
        {:else if hits.length === 0}
          <div class="px-4 py-3 text-sm text-fg-subtle italic">
            {bodies.isLoading ? "Still indexing…" : "No matches."}
          </div>
        {:else}
          <ul>
            {#each hits as hit, i (hit.path)}
              <li>
                <button
                  type="button"
                  onclick={(e) => {
                    e.stopPropagation();
                    open(hit);
                  }}
                  onmouseenter={() => (selectedIndex = i)}
                  class="w-full text-left px-4 py-2 flex flex-col gap-0.5 {i === selectedIndex
                    ? 'bg-surface-2'
                    : 'hover:bg-surface-2/60'}"
                >
                  <div class="flex items-center gap-3 text-sm">
                    <span
                      class="text-xs uppercase tracking-wide w-12 shrink-0 {kindColor[hit.kind]}"
                    >
                      {hit.kind}
                    </span>
                    <span class="flex-1 truncate text-fg"
                      >{@html highlightMatches(hit.title, tokens)}</span
                    >
                    <span class="text-xs text-fg-subtle truncate max-w-[40%]">{hit.hint}</span>
                  </div>
                  {#if hit.snippet}
                    <div class="pl-[3.75rem] text-xs text-fg-subtle truncate">
                      {@html highlightMatches(hit.snippet, tokens)}
                    </div>
                  {/if}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
  </div>
{/if}
