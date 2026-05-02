<script lang="ts">
  import { page } from "$app/state";
  import { reminders } from "$lib/stores/reminders.svelte";
  import { vault } from "$lib/stores/vault.svelte";
  import { vaultApi } from "$lib/api/vault";
  import { noteHref, noteRelativePath, decodeNoteRouteParam } from "$lib/utils/notePath";
  import { formatReminder } from "$lib/utils/reminder";
  import { withContextMenu } from "$lib/utils/contextMenu";
  import { confirm } from "$lib/stores/confirm.svelte";
  import type { VaultEntry } from "$lib/api/vault";

  let pastExpanded = $state(false);

  function deleteReminder(entry: VaultEntry) {
    confirm.ask({
      title: `Delete reminder "${reminderTitle(entry)}"?`,
      message: "The reminder file will be moved to the Trash.",
      confirmLabel: "Move to Trash",
      danger: true,
      onConfirm: async () => {
        await vaultApi.deletePath(entry.path);
      },
    });
  }

  function reminderTime(e: VaultEntry): string {
    const fm = (e.frontmatter ?? {}) as Record<string, unknown>;
    return (fm.reminder as string) ?? "";
  }

  function reminderTitle(e: VaultEntry): string {
    const fm = (e.frontmatter ?? {}) as Record<string, unknown>;
    const fileName = e.path.split("/").pop()?.replace(/\.md$/, "") ?? "";
    return (fm.title as string) ?? fileName;
  }

  function isPast(e: VaultEntry): boolean {
    if (!vault.path) return false;
    return e.path.startsWith(`${vault.path}/reminders/past/`);
  }

  const activeRelativePath = $derived(
    page.url.pathname.startsWith("/notes/")
      ? decodeNoteRouteParam(page.url.pathname.slice("/notes/".length))
      : null,
  );

  const all = $derived(Array.from(reminders.entries.values()));

  const active = $derived(
    all
      .filter((e) => !isPast(e))
      .sort((a, b) => reminderTime(a).localeCompare(reminderTime(b))),
  );

  const past = $derived(
    all
      .filter((e) => isPast(e))
      .sort((a, b) => reminderTime(b).localeCompare(reminderTime(a))),
  );

  function relPath(e: VaultEntry): string {
    return vault.path ? noteRelativePath(e.path, vault.path) : "";
  }
</script>

{#each active as r (r.path)}
  {@const rp = relPath(r)}
  <a
    href={noteHref(rp)}
    use:withContextMenu={() => [
      { label: "Delete reminder…", danger: true, action: () => deleteReminder(r) },
    ]}
    class="flex items-center justify-between gap-2 px-2 py-0.5 rounded truncate {activeRelativePath ===
    rp
      ? 'bg-surface-2 text-fg'
      : 'text-fg hover:bg-surface-2/60'}"
    title={rp}
  >
    <span class="truncate">{reminderTitle(r)}</span>
    <span class="shrink-0 text-xs text-fg-subtle">{formatReminder(reminderTime(r))}</span>
  </a>
{/each}

{#if past.length > 0}
  <button
    type="button"
    onclick={() => (pastExpanded = !pastExpanded)}
    class="w-full text-left px-2 py-0.5 rounded text-fg-muted hover:bg-surface-2/60 truncate flex items-center gap-1"
  >
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      class="w-4 h-4 shrink-0 text-fg-muted transition-transform {pastExpanded ? 'rotate-90' : ''}"
    >
      <path d="M9 6 L15 12 L9 18" />
    </svg>
    <span class="truncate">past</span>
    <span class="text-xs text-fg-subtle ml-auto">{past.length}</span>
  </button>
  {#if pastExpanded}
    {#each past as r (r.path)}
      {@const rp = relPath(r)}
      <a
        href={noteHref(rp)}
        use:withContextMenu={() => [
          { label: "Delete reminder…", danger: true, action: () => deleteReminder(r) },
        ]}
        class="flex items-center justify-between gap-2 px-2 py-0.5 pl-7 rounded truncate text-fg-muted opacity-70 hover:bg-surface-2/60"
        title={rp}
      >
        <span class="truncate line-through">{reminderTitle(r)}</span>
        <span class="shrink-0 text-xs text-fg-faint">{formatReminder(reminderTime(r))}</span>
      </a>
    {/each}
  {/if}
{/if}
