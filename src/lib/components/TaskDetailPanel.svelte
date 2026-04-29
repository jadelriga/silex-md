<script lang="ts">
  import { onMount } from "svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { tasks } from "$lib/stores/tasks.svelte";
  import { vaultApi } from "$lib/api/vault";
  import { syncEvents } from "$lib/stores/syncEvents.svelte";
  import { buildTaskContent } from "$lib/utils/yaml";
  import { clickOutside } from "$lib/utils/clickOutside";
  import { toggleCheckboxAtIndex } from "$lib/utils/checkbox";
  import CodeMirrorEditor from "./CodeMirrorEditor.svelte";
  import MarkdownPreview from "./MarkdownPreview.svelte";

  let { path }: { path: string } = $props();

  const entry = $derived(tasks.entries.get(path) ?? null);

  let titleDraft = $state("");
  let priorityDraft = $state("");
  let tagsDraft = $state("");
  let dueDraft = $state("");
  let estimateDraft = $state("");
  let bodyDraft = $state("");
  let bodyLoaded = $state(false);

  let baseFrontmatter = $state<Record<string, unknown>>({});
  let baseBody = $state("");

  let saving = $state(false);
  let saveError = $state<string | null>(null);
  let externalChangeWhileDirty = $state(false);
  let lastSavedAt = $state(0);

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let editMode = $state(false);

  const dirty = $derived(
    bodyLoaded &&
      (bodyDraft !== baseBody ||
        titleDraft !== ((baseFrontmatter.title as string) ?? "") ||
        priorityDraft !== ((baseFrontmatter.priority as string) ?? "") ||
        tagsDraft !== ((baseFrontmatter.tags as string[] | undefined) ?? []).join(", ") ||
        dueDraft !== ((baseFrontmatter.due as string) ?? "") ||
        estimateDraft !== ((baseFrontmatter.estimate as string) ?? "")),
  );

  async function loadFromDisk() {
    if (!entry) return;
    const fm = (entry.frontmatter ?? {}) as Record<string, unknown>;
    titleDraft = (fm.title as string) ?? "";
    priorityDraft = (fm.priority as string) ?? "";
    tagsDraft = ((fm.tags as string[] | undefined) ?? []).join(", ");
    dueDraft = (fm.due as string) ?? "";
    estimateDraft = (fm.estimate as string) ?? "";
    baseFrontmatter = { ...fm };
    try {
      const body = await vaultApi.readTaskBody(path);
      bodyDraft = body;
      baseBody = body;
      bodyLoaded = true;
      externalChangeWhileDirty = false;
      lastSavedAt = Date.now();
    } catch (e) {
      saveError = e instanceof Error ? e.message : String(e);
    }
  }

  onMount(() => {
    loadFromDisk();
  });

  $effect(() => {
    const ev = syncEvents.externalChange;
    if (!ev) return;
    if (ev.path !== path) return;
    if (ev.ts <= lastSavedAt) return;
    if (dirty) {
      externalChangeWhileDirty = true;
    } else {
      loadFromDisk();
    }
  });

  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(doSave, 300);
  }

  async function doSave() {
    if (!entry || !dirty) return;
    saving = true;
    saveError = null;
    try {
      const fm: Record<string, unknown> = {
        ...((entry.frontmatter ?? {}) as Record<string, unknown>),
      };
      if (titleDraft) fm.title = titleDraft;
      else delete fm.title;
      if (priorityDraft) fm.priority = priorityDraft;
      else delete fm.priority;
      const tags = tagsDraft
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      if (tags.length) fm.tags = tags;
      else delete fm.tags;
      if (dueDraft) fm.due = dueDraft;
      else delete fm.due;
      if (estimateDraft) fm.estimate = estimateDraft;
      else delete fm.estimate;
      fm.updated = new Date().toISOString().slice(0, 10);

      const content = buildTaskContent(fm, bodyDraft);
      await tasks.save(path, content);
      baseFrontmatter = fm;
      baseBody = bodyDraft;
      lastSavedAt = Date.now();
    } catch (e) {
      saveError = e instanceof Error ? e.message : String(e);
    } finally {
      saving = false;
    }
  }

  async function close() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (dirty) await doSave();
    ui.openTaskPath = null;
  }

  function onFieldChange() {
    scheduleSave();
  }

  function onBodyChange(next: string) {
    bodyDraft = next;
    scheduleSave();
  }

  function onToggleCheckbox(index: number) {
    bodyDraft = toggleCheckboxAtIndex(bodyDraft, index);
    scheduleSave();
  }
</script>

<aside
  use:clickOutside={{ callback: close, ignore: "[data-card]" }}
  class="h-full w-[40rem] max-w-full bg-surface-1 border-l border-border flex flex-col shadow-2xl"
>
  <header
    class="flex items-center justify-between px-4 py-2 border-b border-border text-xs text-fg-subtle"
  >
    <span class="truncate" title={path}>{path}</span>
    <div class="flex items-center gap-3">
      <button
        onclick={() => (editMode = !editMode)}
        class="text-fg-muted hover:text-fg"
      >
        {editMode ? "preview" : "edit"}
      </button>
      <button onclick={close} class="text-fg-muted hover:text-fg" aria-label="Close">
        close
      </button>
    </div>
  </header>

  {#if !entry}
    <div class="p-4 text-fg-subtle">Task not found.</div>
  {:else}
    {#if externalChangeWhileDirty}
      <div
        class="px-4 py-2 bg-warn-bg border-b border-warn-border text-sm text-warn-fg flex items-center justify-between"
      >
        <span>File changed on disk while you were editing.</span>
        <span class="space-x-3 text-xs">
          <button class="underline hover:text-fg" onclick={loadFromDisk}>Reload</button>
          <button
            class="underline hover:text-fg"
            onclick={() => (externalChangeWhileDirty = false)}
          >
            Keep mine
          </button>
        </span>
      </div>
    {/if}

    <div class="px-4 py-3 space-y-2 border-b border-border">
      <input
        bind:value={titleDraft}
        oninput={onFieldChange}
        class="w-full bg-transparent text-lg font-medium text-fg outline-none placeholder:text-fg-faint"
        placeholder="Title"
      />

      <div class="flex items-center gap-2 text-sm flex-wrap">
        <select
          bind:value={priorityDraft}
          onchange={onFieldChange}
          class="bg-surface-2 border border-border-strong rounded px-2 py-1 text-fg"
        >
          <option value="">priority…</option>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
        </select>

        <input
          bind:value={dueDraft}
          oninput={onFieldChange}
          type="date"
          class="bg-surface-2 border border-border-strong rounded px-2 py-1 text-fg"
        />

        <input
          bind:value={estimateDraft}
          oninput={onFieldChange}
          placeholder="estimate"
          class="bg-surface-2 border border-border-strong rounded px-2 py-1 text-fg w-28"
        />
      </div>

      <input
        bind:value={tagsDraft}
        oninput={onFieldChange}
        class="w-full bg-surface-2 border border-border-strong rounded px-2 py-1 text-sm text-fg"
        placeholder="tags (comma-separated)"
      />

      <div class="text-xs text-fg-subtle flex items-center gap-3">
        {#if saving}
          <span>saving…</span>
        {:else if dirty}
          <span class="text-fg-muted">unsaved changes</span>
        {:else if bodyLoaded}
          <span>saved</span>
        {/if}
        {#if entry.subtaskTotal > 0}
          <span>{entry.subtaskDone}/{entry.subtaskTotal} subtasks</span>
        {/if}
        {#if saveError}
          <span class="text-red-400 truncate">{saveError}</span>
        {/if}
      </div>
    </div>

    <div class="flex-1 min-h-0 overflow-auto">
      {#if !bodyLoaded}
        <div class="p-4 text-fg-subtle text-sm">Loading…</div>
      {:else if editMode}
        <CodeMirrorEditor value={bodyDraft} onChange={onBodyChange} />
      {:else}
        <div
          role="textbox"
          tabindex="0"
          ondblclick={() => (editMode = true)}
          onkeydown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              editMode = true;
            }
          }}
          class="cursor-text h-full min-h-full"
          title="Double-click or press Enter to edit"
        >
          {#if bodyDraft.trim() === ""}
            <div class="p-4 text-fg-faint italic select-none">
              Empty. Double-click or press Enter to start writing.
            </div>
          {:else}
            <MarkdownPreview source={bodyDraft} {onToggleCheckbox} />
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</aside>
