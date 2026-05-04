# Silex decision log

Long-form decision rationale, per-step build notes, and historical context that's outgrown CLAUDE.md. CLAUDE.md is the live source-of-truth for project state and forward-looking plans; this file is the archive of *how we got here*. Skim this only when you need to understand why something is the way it is.

## Markdown editor alternatives (resolved 2026-05-03)

**Resolution:** moved to **Option C** in Phase 6. The byte-perfect-by-construction approach (CM6 decorations on raw Markdown) is the only design compatible with the multi-tool workflow (Claude Code via embedded terminal + external editors writing the same `.md` files). Option B's tree-serialise-on-save would produce noisy diffs and constant conflict-banner fires.

The path here was longer than the spec implies — the decision rule originally said *"don't attempt Option C unless the editor is the product"* and we held to that for months. What changed: the editor toggle (Option A) really did become the friction point in daily use, and the user accepted the engineering cost.

For posterity, the three options as we saw them when the project started:

### Option A — Preview/edit toggle (was the v1 default)
- **Effort**: shipped in step 8.
- **Pros**: bytes preserved exactly; CodeMirror gives a real text editor when you need it.
- **Cons**: not Notion-like; two modes; deliberate switch required; editing feels heavier.

### Option B — Switch to Milkdown + Crepe (rejected)
- **Effort**: 2–3 days.
- **What it gets you**: polished Notion-style editor for free; slash commands; inline rendering; tables/embeds; ProseMirror under the hood.
- **Cons**: ProseMirror serialises a tree to Markdown on save → **not byte-perfect**:
  - `*foo*` may flip to `_foo_`; trailing whitespace shifts; ordered lists may renumber.
  - Every external edit-then-app-save would produce a diff even with no semantic change.
  - Conflict banner would fire constantly.
  - Mitigations exist (style enforcement, byte normalisation in `writeHashes`) but none fully fix it.
- **When picked**: only if "the editor toggle is the dealbreaker" AND we accept secondary terminal/external-editor flow. We didn't accept that trade.

### Option C — Live-preview decorations on top of CodeMirror (chosen)
- **Effort**: 1–2+ weeks.
- **What it gets you**: Obsidian-style — markers (`**`, `#`, `> `) hide off-cursor, line renders styled, all on raw markdown.
- **Pros**: bytes preserved; Notion-like feel for most content.
- **Cons**: every Markdown construct is its own decoration plugin with edge cases. Existing community packages cover only fractions. Obsidian has 5+ years of polish on theirs and still has rough edges.

## Step-by-step implementation history

### Step 6 — Sync loop (the foundation)

Hash-based dedup eliminates write/watcher race conditions:

- Rust `watch_vault` uses the `notify` crate. Watcher state is `Mutex<Option<RecommendedWatcher>>` managed by Tauri; calling `watch_vault` again replaces the previous watcher.
- For every `.md` file change, Rust emits `vault:changed { path, hash, kind }`. Hash is SHA-256 hex (or `null` for `removed`).
- Rust `read_entry(vaultPath, path)` returns one parsed `VaultEntry` so we can refresh a single file without rescanning.
- Frontend `src/lib/sync.ts` exports `handleVaultChange(event)` (testable) and `startSync()` (sets up the listener):
  - `removed` → `tasks.remove(path)` and `writeHashes.delete(path)`
  - `created`/`modified` with hash matching `writeHashes` → ignore (own write)
  - `created`/`modified` non-matching hash → `vaultApi.readEntry` then `tasks.upsert`
- `startSync()` called once on layout mount; cleanup returned from `onMount`.

Rust unit tests cover subtask counting (mixed list styles), hash determinism, path classification (task vs note).

### Step 7 — Kanban board

- `svelte-dnd-action`, `fractional-indexing`, `js-yaml` (+ `@types/js-yaml`) installed.
- `src/lib/utils/yaml.ts` — `buildTaskContent(frontmatter, body)` serialises via js-yaml and assembles a full file.
- `src/lib/utils/order.ts` — `compareOrder`, `getOrder`, `sortCards`.
- `Card.svelte` (title + priority pill + tags + subtask count); `Column.svelte` (wraps `dndzone`); `Board.svelte` (owns `columnsState`, on finalise computes neighbour-derived order via `generateKeyBetween` and writes only the moved card for same-column reorder, or `moveTask + save` for cross-column).
- Route: `src/routes/boards/[board]/+page.svelte`.
- Sidebar boards as anchor links to `/boards/<encoded-name>`, active highlight from pathname.

**Step 7 follow-up — empty columns:**
- New Rust `list_boards(vaultPath)` walks `<vault>/boards/<board>/<column>/` and returns `BoardLayout[]` (board + columns from directory listing, not file derivation).
- `boards` store is now self-loading via `vaultApi.listBoards`, not derived from tasks.
- `Board.svelte` seeds from layout first, then fills cards from `tasks.entries`. Empty columns persist as long as their directory exists.
- Sync handler refreshes `boards` on each watcher event so external folder changes appear in the UI.

### Step 8 — Task detail panel

- CodeMirror 6 packages: `codemirror`, `@codemirror/state`, `@codemirror/view`, `@codemirror/lang-markdown`, `@codemirror/theme-one-dark`.
- `CodeMirrorEditor.svelte` wraps CM6 with markdown lang + one-dark + line wrapping. Suppresses onChange when dispatching external value updates.
- `TaskDetailPanel.svelte` — fixed right-side panel (40rem). Lazy-loads body via `vaultApi.readTaskBody`. Inline-editable frontmatter (title, priority, due, estimate, tags). 300ms debounced autosave through `tasks.save`, which registers the hash so the watcher echoes back as a no-op. Sets `frontmatter.updated` to today on every save. Flushes pending save on close.
- `syncEvents.svelte.ts` reactive `externalChange = { path, ts }`; `sync.ts` updates it whenever an external (non-deduped) change is detected.
- Conflict banner: external change for the open path while the panel is dirty → amber banner with "Reload" / "Keep mine".
- `Card.svelte` keyboard-accessible (role=button, tabindex, Enter/Space) and clicking opens the panel via `ui.openTaskPath`.
- Layout: `Escape` closes; `{#key ui.openTaskPath}` ensures the panel fully remounts when switching tasks.

**Step 8 polish (post-feedback):**
- Panel slides via `transition:fly` on a wrapper (`x: 640, duration: 220, easing: quintOut`).
- Click outside the panel closes it via `clickOutside` action with optional `ignore` selector. Cards have `data-card`, so clicking another card swaps content instead of closing.
- Body shows as **rendered Markdown by default**, with an `edit` toggle in the header. Used `marked` (gfm) + `@tailwindcss/typography` (`prose prose-invert`); CodeMirror only mounted when in edit mode. (This was Option A from the markdown editor decision; replaced in Phase 6 by Option C.)
- Sync-loop fix: `tasks.save` now computes SHA-256 in JS via `src/lib/utils/hash.ts` and registers the hash in `writeHashes` **before** `vaultApi.writeTask`. Eliminated the race that produced false-positive "external change" banners on every in-app save.

### Step 9 — Notes

- `src/lib/utils/notePath.ts` — `noteRelativePath`, `noteHref`, `decodeNoteRouteParam`, `buildNoteTree` (folder-tree from flat `VaultEntry` list; folders sort before files; `.md` stripped from display only).
- `src/lib/stores/notes.svelte.ts` — `notesStore` with `entries: SvelteMap<path, VaultEntry>`, `isLoaded`, `error`, derived `tree`. Methods mirror tasks (`loadFromVault`, `save`, `upsert`, `remove`).
- `NotesTree.svelte` — recursive sidebar tree. Folders are buttons toggling an `expanded: Set<string>` via `bind:expanded`. Files are anchors to `/notes/<encoded path>`. Active note highlighted from pathname.
- `NoteView.svelte` — full-area editor for the main region. Same lazy body load + debounced autosave + conflict banner + checkbox toggle as `TaskDetailPanel`. Re-loads on `path` prop change via a `lastLoadedPath` effect.
- Route `src/routes/notes/[...path]/+page.svelte` — rest-parameter route.
- Sync handler dispatches by `entry.kind`. `removed` calls both `tasks.remove` and `notes.remove` (no-op if not present).

### Step 10 — Calendar

- `@event-calendar/core` + `@event-calendar/day-grid` (Svelte 5 native, lightweight).
- `CalendarAdapter.ts` — types only. The "adapter" is conceptual: only `Calendar.svelte` imports the underlying lib, so swapping is a one-file change.
- `Calendar.svelte` wraps `createCalendar`/`destroyCalendar`. Options is a `$state` proxy so EC's options-diff effect picks up changes; `$effect` rewrites `calOptions.events` whenever the parent's events prop changes. `.ec-dark` enables EC's built-in dark theme; small CSS overrides push background/borders to match.
- `/calendar/+page.svelte` — derives events from `tasks.entries` (only with `due` frontmatter). Title falls back to filename. Priority maps to colour (high=red, medium=amber, low=blue, none=neutral). Click opens task detail panel.

### Step 11 — Notifications

- `tauri-plugin-notification`; `notification:default` capability.
- `src/lib/scheduler.ts` — `startScheduler()` runs `checkAndNotify()` immediately and every 15 min; `stopScheduler()` clears. Pure helper `dueTodayUnnotified(entries, today, alreadyNotified)` is exported and tested independently.
- Notification format: title `"Due today: <title or filename>"`, body shows priority when present.
- Layout: `startScheduler()` runs whenever `vault.path` is set, `stopScheduler()` cleans up.

**Step 11 — known race / fix log:**
- Initial impl called `void checkAndNotify()` synchronously inside `startScheduler()`. The synchronous reactive read of `tasks.entries.values()` was tracked by the layout's `$effect` that called `startScheduler`, so any change to `tasks.entries` re-ran the entire vault-load chain → notes section flickering and boards not loading. **Fix:** wrap `startScheduler()` in `untrack(() => ...)` at the layout call site.
- Permission prompt only fired when `checkAndNotify` actually had a task to send; if no tasks were due today, `ensurePermission` was never called. **Fix:** `startScheduler` calls `void ensurePermission()` upfront.
- Race: `startScheduler` ran synchronously alongside `tasks.loadFromVault` (async). The immediate `checkAndNotify` saw an empty `tasks.entries`. **Fix:** a separate layout `$effect` watches `tasks.isLoaded` and calls `runCheckNow()` (also `untrack`-wrapped) on transition to `true`.

The user later moved away from due-date notifications toward time-based **reminders** (date + time). The plumbing was reusable — the permission flow, dedup pattern, notification-sending. Trigger mechanism changed.

### Step 12 — Embedded terminal

- Rust crate `portable-pty` (wezterm-pedigree, cross-platform).
- `src-tauri/src/pty.rs`:
  - `PtyState` — `Mutex<HashMap<String, PtySession>>` managed by Tauri. Each session: `MasterPty` + writer + spawned `Child`.
  - `spawn_shell(cwd)` opens a 24×80 PTY, spawns `$SHELL` (`/bin/sh` fallback) with inherited env + `TERM=xterm-256color`. Reader thread emits `shell:output { id, data }` chunks; `shell:exit { id }` on EOF.
  - `shell_input(sessionId, data)` writes to master writer.
  - `shell_resize(sessionId, cols, rows)` resizes.
  - `shell_kill(sessionId)` removes session, kills child.
- npm: `@xterm/xterm`, `@xterm/addon-fit`.
- `Terminal.svelte` dynamic-imports xterm (Vite SSR pre-processing trips on browser-only code otherwise). Spawns shell with `cwd = vault.path`. `term.onData` → `shell_input`; `term.onResize` → `shell_resize`; `ResizeObserver` calls `fitAddon.fit()` on container resize.

The PTY UTF-8 boundary fix (`drain_valid_utf8` in `pty.rs`) was added later in Phase 3.3: each `read()` chunk could split a multi-byte UTF-8 sequence (Nerd icons are 3 bytes, CJK and emoji 3–4), and `String::from_utf8_lossy` replaced both halves with U+FFFD. The fix holds the trailing incomplete bytes between reads. See commit b73a2e8.

### Step 13 — Command palette

- `src/lib/utils/palette.ts` — `PaletteItem` type, `buildPaletteItems(sources)` builds the action list from boards/notes/tasks plus static actions. `filterPaletteItems(items, query, limit=30)` does case-insensitive multi-token AND-substring matching against each item's `search` string. Pure functions, well-tested.
- `CommandPalette.svelte` — overlay UI: 32rem dark card centered horizontally at 15vh from top, backdrop blur, autofocused input, scrollable list with kind pills. Arrow keys navigate (wraps); Enter runs; Esc and backdrop-click close.
- `⌘P` toggles via the layout's global keydown handler (later replaced by the OS menu accelerator in Phase 3).
- The Esc → close-task-panel branch checks `!ui.paletteOpen` so opening the palette while a task is open doesn't fight over Esc.

Later split into nav (Cmd+P) + commands (Cmd+Shift+P) palettes.

### Step 14 — Search overlay

- New Rust `read_bodies(vaultPath)` walks the vault and returns `HashMap<path, body>` for every `.md` outside `/templates`. Body extracted via `gray_matter`.
- `bodies` store with `cache: SvelteMap<path, body>`, `isLoaded`, `isLoading`, `error`. `ensureLoaded(vaultPath)` lazy-loads on first search-open. `invalidate(path)` deletes one entry; `refresh(path)` re-reads. Tasks/notes `save` calls `bodies.refresh(path)` so search stays current.
- `searchEntries(entries, bodies, query, limit=50)` does case-insensitive multi-token AND-substring matching across title + flattened frontmatter values + body. Returns `SearchHit[] = { path, kind, title, hint, snippet }`. `buildSnippet(body, query, span=120)` centers around the first match with `…` ellipses, collapsing whitespace.
- `SearchOverlay.svelte` — 48rem overlay opened by `⌘⇧F`. Triggers `bodies.ensureLoaded`. Result row: kind pill / title / hint / snippet. Arrow keys navigate, Enter opens (task → detail panel; note → main route), Esc/backdrop closes. Click handler `stopPropagation`s so opening a task here doesn't get cancelled by the detail panel's clickOutside.

Filter chips and match highlighting were added later in Phase 4.

### Step 15 — Theming + keyboard shortcuts

Originally planned as 6 sub-steps; delivered in 2 iterations:

**Iter 1 (CSS-variable theme foundation):**
- `app.css` defines semantic tokens via Tailwind v4's `@theme` block: `surface`, `surface-1/2/3/deep`, `fg`, `fg-muted/subtle/faint`, `border`, `border-strong`, `warn-bg/border/fg`, `accent` / `accent-fg` / `accent-hover`, `backdrop`. Default values match the existing dark UI; `.theme-light` overrides them with the light variant.
- All Svelte components migrated to tokens — no hardcoded `bg-neutral-*` / `text-neutral-*` / `border-neutral-*` / `bg-black` remain in app code.
- Calendar's CSS overrides moved to `var(--color-…)` so light values flow through.

**Iter 2 (light theme + switcher + polish):**
- `theme.svelte.ts` — `pref: "system" | "light" | "dark"`, derived `effective: "light" | "dark"`, persists via Tauri store plugin (`themePref` in `settings.json`). `load()` reads the saved pref and listens to `prefers-color-scheme: dark` changes for live system-preference updates. `applyToDocument()` toggles `.theme-light` and calls `getCurrentWindow().setTheme(effective)` so the macOS title-bar chrome matches.
- Three command-palette actions: "Theme: Use system / Light / Dark".
- `MarkdownPreview` toggled `prose-invert` (later removed when MarkdownPreview itself was deleted in Phase 6 iter 3).
- `CodeMirrorEditor` only loads `oneDark` when effective is dark.
- `Calendar.svelte` conditionally applies `.ec-dark`.
- `settings.svelte.ts` — generic settings store. Currently `terminalHeight` (persisted to `settings.json`).
- Mutual exclusion of overlays: opening palette closes search and vice versa.

**Notes for future theme polish:**
- Tauri's `getCurrentWindow().setTheme()` on older macOS may not redraw title bar until window hidden/shown again. Acceptable.
- Light-theme visual sweep: priority pills, kind pills, focus rings, conflict banner — eyeball-pass once light mode sees real use.
- CodeMirror live theme switching while editor is mounted needs a separate Compartment + `view.dispatch({ effects: themeCompartment.reconfigure(newTheme) })`. Easy add when needed.

## Step 11 deferrals (later resolved)

- ~~Configurable lead time (notify N days before due)~~ — `due` is date-only with no time-of-day, so superseded by the time-based reminders feature.
- ~~Click-notification → focus task~~ — still pending (Phase 5 task).
- Re-trigger checks on task edits — currently `runCheckNow` only fires on `tasks.isLoaded` transition. Editing a task to be due-today won't notify until the next 15-min tick or app launch. Fix is a debounced effect on `tasks.entries`.

## Step 12 deferrals (later resolved)

- ~~Persistent terminal across panel toggles~~ Shipped in Phase 3.4 (`terminalEverOpened` flag + `class:hidden`).
- Multiple terminal tabs — state already supports multiple sessions; UI is single-pane.
- ~~Theming via CSS vars / per-user font config~~ Shipped in Phase 3.3 (Nerd Font bundle).
- Copy/paste keybindings beyond xterm's defaults.
- Ligatures / image protocol / etc. — xterm.js add-ons exist; not added.

## Step 13 deferrals (later resolved)

- ~~Create-new-* actions ("New task", "New note", "New board")~~ Shipped (board/note/folder via inline-input + palette actions; task-from-board added later).
- ~~Settings + theme switching~~ Shipped in Phase 3.2 (SettingsModal).
- Fuzzy matching — substring is fine for current vault sizes; swap in a small fuzzy lib (`fzf`, `fuse.js`) only if needed.
- Recent-items pinning to the top.

## Step 14 deferrals (later resolved)

- ~~Filter chips~~ Shipped in Phase 4.2.
- ~~Highlight matched term in snippet/title~~ Shipped in Phase 4.1.
- Fuzzy ranking — substring is fine.
- Replace substring with `minisearch` once the vault is large enough that linear scans feel slow.
- ~~Mutual exclusion of overlays~~ Shipped in step 15 iter 2.

## Cleared "polish queue" items (historical)

These were tracked as polish items at the end of step 15 and have all shipped:
- Custom column order per board — `_silex.json` per board with `set_board_column_order` + `create_column` Rust commands; native HTML5 DnD for column reorder.
- Add board / note / notes-folder UI affordances — hover-revealed `+` icons + inline-input pattern (`CreateInput.svelte`) + three palette actions.
- Add card UI (per column "Add a card" inline input) — shipped after the kanban iter.

## Notes that are out of date but kept for context

The original spec at the top of CLAUDE.md mentioned `polish queue` items, "Files of note (current state)", and "Known leftover scaffolding" sections that became stale as the project progressed. They've been removed from CLAUDE.md to reduce bloat; if you ever wonder what files were considered foundational at the early-build stage, look at git history around the step-6 to step-15 commits.
