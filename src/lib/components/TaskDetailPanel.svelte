<script lang="ts">
  import { onMount } from "svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import { tasks } from "$lib/stores/tasks.svelte";
  import { vaultApi } from "$lib/api/vault";
  import { syncEvents } from "$lib/stores/syncEvents.svelte";
  import { buildTaskContent } from "$lib/utils/yaml";
  import { clickOutside } from "$lib/utils/clickOutside";
  import { toast } from "$lib/stores/toast.svelte";
  import { formatReminder } from "$lib/utils/reminder";
  import CodeMirrorEditor from "./CodeMirrorEditor.svelte";
  import ReminderPopover from "./ReminderPopover.svelte";

  let {
    path,
    maximized = false,
    onMaximizeToggle,
  }: {
    path: string;
    maximized?: boolean;
    onMaximizeToggle?: () => void;
  } = $props();

  async function copyPath(e: MouseEvent) {
    // Stop propagation so the panel's clickOutside doesn't fire — the SVG
    // swap from a re-render would otherwise detach the click target before
    // the document handler reads it.
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(path);
      toast.show("Path copied to clipboard");
    } catch (err) {
      console.error("copyPath failed", err);
    }
  }

  function onMaximizeClick(e: MouseEvent) {
    e.stopPropagation();
    onMaximizeToggle?.();
  }

  function onCloseClick(e: MouseEvent) {
    e.stopPropagation();
    void close();
  }

  const entry = $derived(tasks.entries.get(path) ?? null);

  let titleDraft = $state("");
  let priorityDraft = $state("");
  let tagsDraft = $state("");
  let reminderDraft = $state("");
  let estimateDraft = $state("");
  let bodyDraft = $state("");
  let bodyLoaded = $state(false);
  let reminderPopoverOpen = $state(false);

  let baseFrontmatter = $state<Record<string, unknown>>({});
  let baseBody = $state("");

  let saving = $state(false);
  let saveError = $state<string | null>(null);
  let externalChangeWhileDirty = $state(false);
  let lastSavedAt = $state(0);

  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const dirty = $derived(
    bodyLoaded &&
      (bodyDraft !== baseBody ||
        titleDraft !== ((baseFrontmatter.title as string) ?? "") ||
        priorityDraft !== ((baseFrontmatter.priority as string) ?? "") ||
        tagsDraft !== ((baseFrontmatter.tags as string[] | undefined) ?? []).join(", ") ||
        reminderDraft !== ((baseFrontmatter.reminder as string) ?? "") ||
        estimateDraft !== ((baseFrontmatter.estimate as string) ?? "")),
  );

  async function loadFromDisk() {
    if (!entry) return;
    const fm = (entry.frontmatter ?? {}) as Record<string, unknown>;
    titleDraft = (fm.title as string) ?? "";
    priorityDraft = (fm.priority as string) ?? "";
    tagsDraft = ((fm.tags as string[] | undefined) ?? []).join(", ");
    reminderDraft = (fm.reminder as string) ?? "";
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
      if (reminderDraft) fm.reminder = reminderDraft;
      else delete fm.reminder;
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
</script>

<aside
  use:clickOutside={{ callback: close, ignore: "[data-card]" }}
  class="h-full w-full bg-surface-1 border-l border-border flex flex-col shadow-2xl"
>
  <header
    class="flex items-center justify-between gap-2 px-4 py-2 border-b border-border text-xs text-fg-subtle"
  >
    <span class="truncate flex-1 min-w-0" title={path}>{path}</span>
    <div class="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onclick={copyPath}
        title="Copy path"
        aria-label="Copy path"
        class="p-1 rounded text-fg-muted hover:text-fg hover:bg-surface-2"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </button>
      <button
        type="button"
        onclick={onMaximizeClick}
        title={maximized ? "Restore" : "Maximize"}
        aria-label={maximized ? "Restore" : "Maximize"}
        class="p-1 rounded text-fg-muted hover:text-fg hover:bg-surface-2"
      >
        {#if maximized}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
            <polyline points="4 14 10 14 10 20" />
            <polyline points="20 10 14 10 14 4" />
            <line x1="14" y1="10" x2="21" y2="3" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" y1="3" x2="14" y2="10" />
            <line x1="3" y1="21" x2="10" y2="14" />
          </svg>
        {/if}
      </button>
      <button
        type="button"
        onclick={onCloseClick}
        title="Close"
        aria-label="Close"
        class="p-1 rounded text-fg-muted hover:text-fg hover:bg-surface-2"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round" class="w-4 h-4">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
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
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
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

        <div class="relative">
          <button
            type="button"
            onclick={(e) => {
              e.stopPropagation();
              reminderPopoverOpen = !reminderPopoverOpen;
            }}
            title={reminderDraft ? `Reminder: ${formatReminder(reminderDraft)}` : "Set reminder"}
            class="bg-surface-2 border border-border-strong rounded px-2 py-1 text-fg flex items-center gap-1.5 {reminderDraft
              ? 'text-amber-400'
              : ''}"
          >
            {#if reminderDraft}
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                stroke="none"
                class="w-4 h-4 shrink-0"
                aria-hidden="true"
              >
                <path
                  d="M12 2a1 1 0 0 1 1 1v.59a7.001 7.001 0 0 1 6 6.91V14l1.7 2.55A1 1 0 0 1 19.86 18H4.14a1 1 0 0 1-.84-1.45L5 14V10.5a7.001 7.001 0 0 1 6-6.91V3a1 1 0 0 1 1-1zm-2.5 18a2.5 2.5 0 0 0 5 0h-5z"
                />
              </svg>
              <span class="text-xs">{formatReminder(reminderDraft)}</span>
            {:else}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                class="w-4 h-4 shrink-0"
                aria-hidden="true"
              >
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
              <span class="text-xs text-fg-subtle">Reminder</span>
            {/if}
          </button>
          {#if reminderPopoverOpen}
            <ReminderPopover
              value={reminderDraft || null}
              onSave={(iso) => {
                reminderDraft = iso;
                reminderPopoverOpen = false;
                onFieldChange();
              }}
              onClear={() => {
                reminderDraft = "";
                reminderPopoverOpen = false;
                onFieldChange();
              }}
              onClose={() => (reminderPopoverOpen = false)}
            />
          {/if}
        </div>

        <input
          bind:value={estimateDraft}
          oninput={onFieldChange}
          placeholder="estimate"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="off"
          spellcheck="false"
          class="bg-surface-2 border border-border-strong rounded px-2 py-1 text-fg w-28"
        />
      </div>

      <input
        bind:value={tagsDraft}
        oninput={onFieldChange}
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        class="w-full bg-surface-2 border border-border-strong rounded px-2 py-1 text-sm text-fg"
        placeholder="tags (comma-separated)"
      />

      <div class="text-xs text-fg-subtle flex items-center gap-3">
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
      {:else}
        <CodeMirrorEditor value={bodyDraft} onChange={onBodyChange} />
      {/if}
    </div>
  {/if}
</aside>
