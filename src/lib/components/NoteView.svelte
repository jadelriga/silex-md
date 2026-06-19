<script lang="ts">
  import { onMount } from "svelte";
  import { notes } from "$lib/stores/notes.svelte";
  import { reminders } from "$lib/stores/reminders.svelte";
  import { vaultApi } from "$lib/api/vault";
  import { syncEvents } from "$lib/stores/syncEvents.svelte";
  import { buildTaskContent } from "$lib/utils/yaml";
  import { toast } from "$lib/stores/toast.svelte";
  import CodeMirrorEditor from "./CodeMirrorEditor.svelte";

  let { path }: { path: string } = $props();

  const entry = $derived(notes.entries.get(path) ?? reminders.entries.get(path) ?? null);

  let titleDraft = $state("");
  let bodyDraft = $state("");
  let bodyLoaded = $state(false);

  let baseFrontmatter = $state<Record<string, unknown>>({});
  let baseBody = $state("");

  let saving = $state(false);
  let saveError = $state<string | null>(null);
  let externalChangeWhileDirty = $state(false);
  let lastSavedAt = $state(0);
  let lastLoadedPath = $state<string | null>(null);

  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  async function copyPath() {
    try {
      await navigator.clipboard.writeText(path);
      toast.show("Path copied to clipboard");
    } catch (e) {
      console.error("copyPath failed", e);
    }
  }

  const fileName = $derived(path.split("/").pop()?.replace(/\.md$/, "") ?? "");

  const dirty = $derived(
    bodyLoaded &&
      (bodyDraft !== baseBody || titleDraft !== ((baseFrontmatter.title as string) ?? "")),
  );

  async function loadFromDisk() {
    if (!entry) return;
    const fm = (entry.frontmatter ?? {}) as Record<string, unknown>;
    titleDraft = (fm.title as string) ?? "";
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

  $effect(() => {
    if (path !== lastLoadedPath) {
      lastLoadedPath = path;
      bodyLoaded = false;
      loadFromDisk();
    }
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
      fm.updated = new Date().toISOString().slice(0, 10);

      const content = buildTaskContent(fm, bodyDraft);
      await notes.save(path, content);
      baseFrontmatter = fm;
      baseBody = bodyDraft;
      lastSavedAt = Date.now();
    } catch (e) {
      saveError = e instanceof Error ? e.message : String(e);
    } finally {
      saving = false;
    }
  }

  function onTitleChange() {
    scheduleSave();
  }

  function onBodyChange(next: string) {
    bodyDraft = next;
    scheduleSave();
  }
</script>

<div class="h-full flex flex-col bg-surface">
  {#if !entry}
    <div class="p-6 text-fg-subtle">Note not found at {path}.</div>
  {:else}
    {#if externalChangeWhileDirty}
      <div
        class="px-6 py-2 bg-warn-bg border-b border-warn-border text-sm text-warn-fg flex items-center justify-between"
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

    <div class="flex items-center gap-2 px-6 pt-6 pb-2">
      <input
        bind:value={titleDraft}
        oninput={onTitleChange}
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        class="flex-1 bg-transparent text-2xl font-light text-fg outline-none placeholder:text-fg-faint"
        placeholder={fileName}
      />
      <button
        type="button"
        onclick={copyPath}
        title="Copy path"
        aria-label="Copy path"
        class="p-1.5 rounded text-fg-muted hover:text-fg hover:bg-surface-2 shrink-0"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="w-4 h-4"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </button>
    </div>

    {#if saveError}
      <div class="px-6 text-xs text-red-400 truncate">{saveError}</div>
    {/if}

    <div class="flex-1 min-h-0 overflow-auto">
      {#if !bodyLoaded}
        <div class="p-6 text-fg-subtle text-sm">Loading…</div>
      {:else}
        <CodeMirrorEditor value={bodyDraft} onChange={onBodyChange} {path} />
      {/if}
    </div>
  {/if}
</div>
