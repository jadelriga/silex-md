# Silex

Lightweight desktop kanban + notes app. Markdown files are the database; the app is a fast view over them. Cross-platform via Tauri 2; primary target is macOS. Designed to be scriptable by Claude Code through an embedded terminal that has full access to the vault.

This file is the source of truth for project state and decisions. Read it first when resuming work.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Tauri 2 |
| Frontend | SvelteKit (adapter-static, SPA mode) + Svelte 5 + TypeScript |
| Build tool | Vite 6 |
| Styling | Tailwind v4 (`@tailwindcss/vite` plugin) |
| Kanban DnD | svelte-dnd-action *(not yet added)* |
| Calendar | FullCalendar or EventCalendar, behind `CalendarAdapter` *(not yet added)* |
| Markdown editor | CodeMirror 6 *(not yet added)* |
| Frontmatter | gray-matter *(not yet added)* |
| Fractional ordering | fractional-indexing *(not yet added)* |
| Terminal | xterm.js (frontend) + portable-pty (Rust) *(not yet added)* |
| File watching | Tauri watch plugin *(not yet added)* |
| Notifications | Tauri notification plugin *(not yet added)* |
| Persistent prefs | Tauri store plugin *(not yet added)* |

## File structure philosophy

The user-selected vault folder is the database. No external storage.

```
/vault
  /boards
    /<board>
      /<column>
        <task-slug>.md
  /notes
    ...freely organized .md files
  /templates
    default-task.md
```

Rule: anything under `/boards/<board>/<column>/` is a kanban task. Any other `.md` file is a note.

**Path is canonical** for board/column/status. Frontmatter holds metadata (title, priority, due, tags, order, etc.). On read, we compute board/column/status from the path and rewrite frontmatter to match. Frontmatter never wins over path.

## Sync loop (the foundation, built in step 6)

Hash-based dedup eliminates write/watcher race conditions:

- On every internal write: compute SHA-256 of bytes, store in `writeHashStore[path]`, then write atomically (temp file + rename).
- On every watcher event: hash the file, compare to `writeHashStore[path]`. Match → ignore (own write). Mismatch → external change.
- External-change reconciliation: if no panel is open or panel is clean → silent reload. If panel is dirty → non-blocking banner: *"File changed on disk. Reload / Keep mine / Show diff."* Never auto-overwrite.

Build this with integration tests **before** features on top.

## Implementation order

- [x] **1. Scaffold** — Tauri 2 + SvelteKit + Svelte 5 + TS + Vite + Tailwind v4
- [x] **2. App shell** — sidebar + main area + hidden bottom terminal panel (`Cmd+J` toggles)
- [x] **3. Vault selection** — first-launch modal, native folder picker via Tauri dialog plugin, persist via Tauri store plugin
- [x] **4. Rust commands** — `read_vault` (frontmatter only), `read_task_body`, `write_task` (atomic, returns hash), `move_task`, `delete_task`
- [x] **5. Svelte stores** — `vaultStore`, `boardsStore`, `tasksStore`, `uiStore` (full), `writeHashStore`
- [x] **6. Sync loop + integration tests** — `watch_vault` Rust + hash-dedup + reconciliation. Don't progress until bulletproof.
- [x] **7. Kanban board** — svelte-dnd-action, file moves on drop, fractional-indexing for order
- [x] **8. Task detail panel** — lazy body load, CodeMirror 6 editor, debounced autosave (300ms), dirty-state tracking, conflict banner
- [x] **9. Notes** — sidebar tree + full-area editor, same sync loop. Wikilinks/backlinks deferred to post-v1.
- [x] **10. Calendar view** — read-only over local due dates, behind `CalendarAdapter` interface
- [x] **11. Notifications** — Tauri plugin + 15-minute interval, configurable lead time
- [x] **12. Embedded terminal** — portable-pty + xterm.js (real PTY required, not piped stdio)
- [x] **13. Command palette** — `Cmd+P`, custom Svelte component
- [x] **14. Search overlay** — `Cmd+Shift+F`, full-text across title + frontmatter + body (scope expanded from "frontmatter + title only" per user preference)
- [x] **15. Theming + keyboard shortcuts** — CSS-variable theme system, system/light/dark with manual override, polish-queue items folded in

### Step 15 plan (so we don't lose it across iterations)

1. **CSS variable theme foundation.** Define semantic tokens (surface, surface-1/2/3/deep; fg, fg-muted/subtle/faint; border, border-strong; warn-bg/border/fg; backdrop) in `app.css` via Tailwind v4's `@theme` block. Default values match the current dark UI; a `.theme-light` selector overrides for the light variant.
2. **Refactor layout, sidebar, vault-setup, and main panels** to use the new tokens (`bg-surface-1`, `text-fg-muted`, etc.) — visual result identical to today, but every color comes from a variable.
3. **Refactor leaf components**: Card, Column, Board, TaskDetailPanel, NotesTree, NoteView, CommandPalette, SearchOverlay, Terminal, MarkdownPreview, Calendar.
4. **Light-theme color review.** Once everything's on tokens, set sensible light values, eyeball each surface, fix anything that doesn't translate (priority pills, calendar's `.ec-dark`, CodeMirror's `oneDark` → swap to a light theme when `theme-light` is active).
5. **Polish-queue items that fit.** Mutual exclusion between palette and search, persist terminal panel height in the Tauri store, restore `tauri.conf.json` window theme to `null` (auto/system).
6. **Theme switcher.** Detection via `prefers-color-scheme`, manual override stored as `themePref: "system" | "light" | "dark"` via the Tauri store plugin, applied to the document root. Three command-palette actions: "Theme: Use system / Light / Dark".

Steps 1–3 are this iteration; user reviews; then 4–6 in the next.

**Deferred from step 15** (handled separately, not in this step):
- `Cmd+N` "new task" and similar creation shortcuts — needs a creation flow, which doesn't exist yet.
- Arrow-key navigation between cards on the board — non-trivial focus model with svelte-dnd-action; do as a dedicated keyboard-nav pass.
- Custom column ordering (the `_silex.json` per-board metadata file) — already on the polish queue, separate concern.
- Highlight matched terms in search snippets — cosmetic.

## Key decisions (and why)

| Decision | Reason |
|---|---|
| **SvelteKit over plain Svelte+Vite** | File-based routing pays off for boards/notes/calendar nav. ~10–20KB overhead is negligible for a desktop app. |
| **Path canonical for board/column/status** | Eliminates filesystem-vs-frontmatter drift. Path wins; frontmatter is rewritten to match. |
| **CodeMirror 6, not TipTap** | TipTap parses Markdown to a tree and re-serializes — round-trips lose byte stability. CodeMirror edits raw text directly, ideal for Markdown-as-source-of-truth. |
| **Hash-based watcher dedup, not timer** | Timers have race windows (FSEvents can fire late, coalesce, etc.). Content hash is deterministic. |
| **Notes added to v1 scope** | Cheap (~1 week extra); reuses sync loop, watcher, editor. Vault has `/boards` and notes everywhere else. |
| **No Google Calendar sync** | Cut from v1. Calendar is read-only over local due dates. Removes OAuth, secrets, conflict resolution. |
| **No secrets storage layer** | Without GCal, no credentials. Tauri store plugin (plain JSON) is enough for prefs. |
| **Real PTY required for terminal** | Claude Code, vim, etc. need a TTY for ANSI rendering and interactive prompts. Use `portable-pty` (cross-platform). |
| **Tauri 2 svelte-ts default template** | SvelteKit + adapter-static, SPA mode — accepted as-is. |
| **Personal email for git** | Local config: `user.email = jadelriga@gmail.com`. |

## Non-goals (v1)

Cloud sync. Multi-user. Mobile app. App Store distribution. Plugin system. Recurring calendar events. Full-text body search (frontmatter + title only). External calendar sync (Google, etc.). Encrypted secrets storage.

## Phased backlog plan

Forward-looking grouping of remaining post-v1 polish work. Each phase is roughly one sitting; iterations within a phase are commit boundaries. Update the checkboxes as items land; move shipped detail into "Current status".

### Phase 1 — Right-click affordances + delete + rename
- [x] **Iter 1 — Primitives + delete.** `withContextMenu` Svelte action, `contextMenu` singleton store, `ContextMenu.svelte` overlay (auto-flip), `confirm` singleton store, `ConfirmDialog.svelte`. Rust `delete_path` (soft-delete via `trash` crate) and `delete_column` (also rewrites `_silex.json`). Wired Delete… on boards, columns, cards, notes, note folders, reminders.
- [ ] **Iter 2 — Rename.** Inline rename for board (sidebar), column (header), note folder (sidebar). Card / note / reminder titles already editable in detail panel / NoteView, so rename for those is the title field — context menu just focuses it. Rust `rename_path` (or extend `move_task`) with conflict detection; board/column rename keeps `_silex.json` in sync.

### Phase 2 — Foundation polish
- [x] **Persist terminal panel height** — already wired in step 15 iter 2: `settings.load()` reads `terminalHeight` on mount, drag-resize clamps to `[80, innerHeight - 120]` and saves on `mouseup` via `setTerminalHeight` → `store.save()`. Default 240px when unset; no flash since terminal is closed by default at launch.
- [x] **Scaffold cleanup.** Removed `static/vite.svg`, `tauri.svg`, `svelte.svg` (unreferenced demo assets) and `tauri-plugin-opener` (Cargo.toml, lib.rs, `default.json` capability, `@tauri-apps/plugin-opener` npm dep).
- [x] **SILEX home banner.** Closed without changes — the existing Unicode box-drawing banner is acceptable. Revisit if it ever looks broken on a target platform.

### Phase 3 — Settings + terminal quality of life
- [x] **Native menu bar.** `src-tauri/src/menu.rs` builds a Tauri menu (Silex / File / Edit / View / Window) with accelerators on the items the JS already handled (Cmd+J, Cmd+P, Cmd+Shift+P, Cmd+Shift+F, Cmd+,). Items emit `menu:<id>` Tauri events; `src/lib/utils/menuListener.ts` `startMenuListener(actions)` listens and dispatches. Layout `onMount` wires every action (creating flows, search/palette/commands toggles, terminal toggle, calendar nav, theme submenu, open vault). The redundant JS keydown handlers for shortcut keys were removed in favour of OS-level accelerators (only Esc-closes-task-panel remains in JS). Preferences… (Cmd+,) currently console-warns; the modal is wired in the next item.
- [x] **Settings modal + Reveal settings file.** `SettingsModal.svelte` opens via Cmd+, (Preferences… in the Silex menu) and writes through `theme.setPref` for now. Theme section (System/Light/Dark radio) and a "Reveal in Finder" button. New File menu item "Reveal Settings File" and two palette actions ("Open settings…", "Reveal settings file"). Settings live in `settings.json` under `appDataDir()` (already true via the Tauri store plugin) — never appears in the sidebar since it's outside the vault. Re-added `tauri-plugin-opener` minimally with only the `opener:allow-reveal-item-in-dir` capability. Terminal font row is intentionally absent until the next item lands.
- [x] **Terminal glyph coverage.** Bundled JetBrains Mono Nerd Font Mono (Regular/Bold/Italic/BoldItalic, ~9.4MB total) in `static/fonts/`. `@font-face` declarations + `--font-mono` token override in `app.css` so Tailwind's `font-mono` utility points at it; an explicit rule forces `.cm-editor` and `.prose code/pre` onto the same family. `Terminal.svelte` awaits `document.fonts.load("13px JetBrainsMono Nerd Font")` before constructing xterm — xterm measures glyph width once at init, so loading the font afterwards would render Nerd icons at the wrong stride.
- [ ] **Persistent terminal session.** Hoist `<Terminal />` mount above the `{#if ui.terminalOpen}` so toggling the panel doesn't kill the PTY (use `display: none` to hide).

### Phase 4 — Search + calendar polish
- [ ] **Highlight search matches** in title and snippet (wrap matched substrings in a styled span).
- [ ] **Search filter chips** — board / kind / priority / tags / due range. Infrastructure already in `searchEntries`; needs UI.
- [ ] **Calendar fills available height.** Investigate EC's row sizing (`--ec-day-height` or similar); see notes in current status.

### Phase 5 — Keyboard + notification UX
- [ ] **Quick-create shortcuts.** `Cmd+N` new task in active board, `Cmd+Shift+N` new note. Reuse the existing inline-create flow.
- [ ] **Click-notification → focus task.** Wire `tauri-plugin-notification` action API: payload includes the task path, click handler sets `ui.openTaskPath`.
- [ ] **Arrow-key card nav** on the board. Non-trivial focus model with svelte-dnd-action — likely needs a dedicated focus-ring abstraction.

## Current status

**Step 15 (and the last numbered step) complete.** Implementation order is finished. Polish queue and follow-ups remain.

**Step 15 — iteration 1 (theme variable foundation):**
- `app.css` defines semantic tokens via Tailwind v4's `@theme` block: `surface`, `surface-1/2/3/deep`, `fg`, `fg-muted/subtle/faint`, `border`, `border-strong`, `warn-bg/border/fg`, `accent` / `accent-fg` / `accent-hover`, `backdrop`. Default values match the existing dark UI; `.theme-light` overrides them with the light variant.
- All Svelte components (`Card`, `Column`, `Board`, `NotesTree`, `NoteView`, `TaskDetailPanel`, `CommandPalette`, `SearchOverlay`, `Terminal`, `MarkdownPreview`, `Calendar`, `VaultSetup`) plus `+layout.svelte`, `+page.svelte`, and `notes/[...path]/+page.svelte` migrated to the new tokens — no hardcoded `bg-neutral-*` / `text-neutral-*` / `border-neutral-*` / `bg-black` remain in app code (greppable).
- Calendar's CSS overrides moved to `var(--color-…)` so light values flow through.

**Step 15 — iteration 2 (light theme + switcher + polish):**
- `src/lib/stores/theme.svelte.ts` — `themeStore` with `pref: "system" | "light" | "dark"`, derived `effective: "light" | "dark"`, persists via Tauri store plugin (`themePref` key in `settings.json`). `load()` reads the saved pref and listens to `prefers-color-scheme: dark` changes for live system-preference updates. `applyToDocument()` toggles `.theme-light` on `documentElement` and calls `getCurrentWindow().setTheme(effective)` so the macOS title-bar chrome matches.
- Layout effect on `theme.effective` calls `applyToDocument()` whenever the resolved theme changes.
- Three command-palette actions: "Theme: Use system", "Theme: Light", "Theme: Dark". Optional `setThemePref` source on `PaletteSources`; tests cover the new actions and that they're omitted when not provided.
- `MarkdownPreview` toggles `prose-invert` based on `theme.effective`. Light theme falls back to default `prose`.
- `CodeMirrorEditor` only loads `oneDark` when effective is dark; light mode uses CodeMirror's default light styling. Note: theme is read at editor mount time — switching themes mid-session doesn't recolor an open editor; reopening the panel/note picks up the new theme.
- `Calendar.svelte` conditionally applies `.ec-dark` based on `theme.effective`, so EC's built-in light styling kicks in for light mode.
- `src/lib/stores/settings.svelte.ts` — small generic settings store. Currently just `terminalHeight` (persisted via the same `settings.json`); restored on layout mount, saved on resize end. Default 240px when unset.
- Mutual exclusion of overlays in the layout's keydown handler: opening the palette closes search, opening search closes the palette. Double-tapping the same shortcut still closes its own overlay.

**Notes for future iteration on theme polish:**
- Tauri's `getCurrentWindow().setTheme()` behaviour on macOS depends on the OS version — on older macOS it may not redraw the title bar until the window is hidden/shown again. Acceptable for v1.
- Light-theme visual sweep: the values in `.theme-light` are sensible defaults but probably need eyeball passes (especially priority pills, kind pills, focus rings, the conflict banner) once you actually use light mode for a while.
- CodeMirror live-theme switching while an editor is mounted would need a separate Compartment for the theme extension and a `view.dispatch({ effects: themeCompartment.reconfigure(newTheme) })` call. Easy to add when desired.
- The Tauri store plugin call from `theme.applyToDocument()` (`getCurrentWindow().setTheme()`) is a fire-and-forget Promise — errors logged but not surfaced to the user.

**Step 14 added:**
- New Rust command `read_bodies(vaultPath)` walks the vault and returns `HashMap<path, body>` for every `.md` file outside `/templates`. The body is the post-frontmatter content extracted via `gray_matter`.
- `src/lib/stores/bodies.svelte.ts` — `bodies` store with `cache: SvelteMap<path, body>`, `isLoaded`, `isLoading`, `error`. `ensureLoaded(vaultPath)` loads the cache lazily on first search-open. `invalidate(path)` deletes one entry; `refresh(path)` re-reads via `read_task_body`. `reset()` clears state when vaults change.
- `tasks.save` and `notes.save` call `bodies.refresh(path)` after writing (only if cache is loaded), so search stays current with edits.
- Sync handler invalidates the cache for `removed` events and refreshes for external `created`/`modified` events.
- `src/lib/utils/search.ts`: `searchEntries(entries, bodies, query, limit=50)` does case-insensitive multi-token AND-substring matching across title + flattened frontmatter values + body. Returns `SearchHit[]` with `{ path, kind, title, hint, snippet }`. `buildSnippet(body, query, span=120)` centers a snippet around the first query match with `…` ellipses on either side, collapsing whitespace.
- `src/lib/components/SearchOverlay.svelte` — 48rem dark overlay opened by `⌘⇧F` (or via `ui.searchOpen`). Triggers `bodies.ensureLoaded` on open. Each result shows kind pill (task/note), title, board/column or relative path hint, and a one-line snippet. Arrow keys navigate (wraps), Enter opens (task → detail panel; note → main-area route), Esc/backdrop-click closes. Click handler `stopPropagation`s so opening a task here doesn't get cancelled by the detail panel's clickOutside (same fix as step 13).
- Layout: `⌘⇧F` toggles `ui.searchOpen`; Esc-closes-task-panel branch updated to also skip when search overlay is open.
- Tests: `src/lib/utils/search.test.ts` adds 12 tests covering `frontmatterText`, `buildSnippet`, and `searchEntries` (empty, title match, case-insensitivity, multi-token AND, frontmatter, body via cache, limit). Total now **66 JS tests** + 4 Rust tests, all passing.

**Step 14 deferrals:**
- Filter chips (board / status / priority / tags / due range). The infrastructure is there; needs UI.
- Fuzzy ranking (e.g., `fzf`-style scoring). Substring is fine for now.
- Replace substring with `minisearch` once the vault is large enough that linear scans feel slow.
- Highlight the matched term in the snippet/title.
- **Mutual exclusion of overlays.** Right now, opening the command palette while search is open (or vice versa) leaves both rendered on top of each other. Triggering one should close the other. Quick fix: each shortcut handler sets the other's `*Open` flag to `false` before flipping its own. Same applies to `Esc` priority order. Worth doing as a tiny polish pass once we touch the shortcut handler again (likely in step 15).

**Step 13 added:**
- `src/lib/utils/palette.ts` — `PaletteItem` type, `buildPaletteItems(sources)` builds the action list from boards/notes/tasks plus two static actions (go to calendar, toggle terminal). `filterPaletteItems(items, query, limit=30)` does case-insensitive multi-token AND-substring matching against each item's `search` string. Both are pure functions.
- `src/lib/components/CommandPalette.svelte` — overlay UI: 32rem dark card centered horizontally at 15vh from the top, backdrop blur, autofocused input, scrollable list (max-h 50vh) with kind pills (board / note / task / action) color-coded. Arrow keys navigate (wraps), `Enter` runs the selected item, `Esc` and backdrop-click close. `bind:this={inputEl}` is a `$state` ref so `tick().then(() => inputEl?.focus())` works on open.
- `⌘P` (no shift) toggles the palette via the layout's existing global keydown handler. The Esc → close-task-panel branch now also checks `!ui.paletteOpen` so opening the palette while a task is open doesn't fight over Esc.
- 11 new tests in `src/lib/utils/palette.test.ts` covering item construction (always-present actions, board/task/note shapes, run-callback behavior, vault-path gating for notes) and filtering (empty query, case insensitivity, multi-token AND, limit). Total now **54 JS tests** + 4 Rust tests, all passing.

**Step 13 deferrals:**
- Create-new-* actions ("New task", "New note", "New board") — no creation UI exists anywhere yet, so plumbing them into the palette would require building the create flows first. Treat as a follow-up once we add those flows.
- Settings + theme switching — neither exists yet.
- Fuzzy matching. Substring matching is fine for the current vault size; if it ever feels slow or imprecise, swap in a small fuzzy lib (`fzf`, `fuse.js`).
- Recent-items pinning to the top.

**Step 12 added:**
- Rust crate `portable-pty` (the wezterm-pedigree cross-platform PTY).
- New module `src-tauri/src/pty.rs`:
  - `PtyState` — `Mutex<HashMap<String, PtySession>>` managed by Tauri. Each session holds a `MasterPty`, a writer, and the spawned `Child`.
  - `spawn_shell(cwd)` opens a 24×80 PTY, spawns `$SHELL` (falling back to `/bin/sh`) inside it with the inherited env plus `TERM=xterm-256color`. Spawns a reader thread per session that emits `shell:output { id, data }` chunks to the frontend, and a `shell:exit { id }` event when the reader hits EOF.
  - `shell_input(sessionId, data)` writes UTF-8 data to the PTY master writer.
  - `shell_resize(sessionId, cols, rows)` resizes the PTY.
  - `shell_kill(sessionId)` removes the session and kills the child.
- npm packages: `@xterm/xterm`, `@xterm/addon-fit`.
- `src/lib/components/Terminal.svelte`:
  - Dynamic-imports xterm modules in `onMount` so Vite SSR pre-processing doesn't trip on browser-only code.
  - One terminal session per mount: spawns shell with `cwd = vault.path`, listens for `shell:output` / `shell:exit` events for its session id, pipes `term.onData` to `shell_input`, `term.onResize` to `shell_resize`, and a `ResizeObserver` calls `fitAddon.fit()` so the geometry stays correct when the panel is resized or the window changes size.
  - `onDestroy` unlistens, calls `shell_kill`, and disposes the terminal. Closing the panel (Cmd+J or close button) tears down the session; reopening creates a fresh one.
- Layout: the bottom panel's placeholder is replaced with `<Terminal />`, wrapped in a `flex-1 min-h-0` div so xterm's canvas sizes correctly.

**Step 12 deferrals:**
- Persistent terminal across panel toggles. Currently each open creates a new session. Could be added by hoisting the Terminal mount above the `{#if ui.terminalOpen}` (using `display: none` to hide instead of unmount) so a long-running command isn't killed when you peek at a board and come back.
- Multiple terminal tabs. The state already supports multiple sessions, only the UI is single-pane.
- Theming via CSS vars / per-user font config. The current theme is hardcoded.
- Copy/paste keybindings beyond xterm's defaults.
- Ligatures / image protocol / etc. — xterm.js add-ons exist for these; not added.

**Step 11 added:**
- `tauri-plugin-notification` installed (Rust + JS), permission `notification:default` granted in capabilities.
- `src/lib/scheduler.ts` — `startScheduler()` runs `checkAndNotify()` immediately and every 15 minutes; `stopScheduler()` clears the interval. Pure helper `dueTodayUnnotified(entries, today, alreadyNotified)` is exported and tested independently. In-memory `Set<string>` of notified paths dedupes within a session.
- Permission flow: first call invokes `requestPermission()` via the plugin if the OS hasn't granted it yet. macOS will show its native permission prompt once.
- Notification format: title `"Due today: <task title or filename>"`, body shows priority when present.
- Layout: `startScheduler()` runs whenever `vault.path` is set (alongside other vault-load actions), `stopScheduler()` cleans up on unmount.
- Tests: `src/lib/scheduler.test.ts` adds 8 tests for `todayIso` formatting and `dueTodayUnnotified` filtering (today match, not-today, already-notified, no due, non-string due, multiple, partial-notified). Total now **43 JS tests** + 4 Rust tests, all passing.

**Step 11 deferrals:**
- Configurable lead time (notify N days before due) — our `due` is date-only with no time-of-day. Add as a polish item once we have a settings UI.
- Click-notification → focus task. macOS default behavior brings the app to focus on click; we don't yet capture which task was clicked. Plumbing requires a notification payload + a click handler via the plugin's action API.
- Re-trigger checks on task edits. Currently `runCheckNow` only fires when `tasks.isLoaded` transitions (once per `loadFromVault`). Editing a task to be due-today during a session won't notify until the next 15-minute tick or the next app launch. Could be added with a debounced effect on `tasks.entries` if it becomes annoying.

**Step 11 — known race / fix log (so we don't trip on these again):**
- Initial implementation called `void checkAndNotify()` synchronously inside `startScheduler()`. The synchronous reactive read of `tasks.entries.values()` was tracked by the layout's `$effect` that called `startScheduler`, so any change to `tasks.entries` re-ran the entire vault-load chain → notes section flickering and boards not loading. Fix: wrap `startScheduler()` in `untrack(() => ...)` at the layout call site.
- Permission prompt only fired when `checkAndNotify` actually had a task to send; if no tasks were due today, `ensurePermission` was never called, no prompt, user never knew notifications existed. Fix: `startScheduler` calls `void ensurePermission()` upfront.
- Race: `startScheduler` ran synchronously alongside `tasks.loadFromVault` (async). The immediate `checkAndNotify` saw an empty `tasks.entries` and noticed nothing. Fix: a separate layout `$effect` watches `tasks.isLoaded` and calls `runCheckNow()` (also `untrack`-wrapped) whenever it transitions to `true`, which happens after `loadFromVault` completes.

**Notes for future user-facing iteration on this:**
- The user has reservations about due-date notifications being the right model. The mental model they had was time-based **reminders** ("remind me at day X at time Y"), which is a different feature: it needs a time-of-day field on tasks (or a separate `reminders` array per task) and either a more granular in-app scheduler or OS-level scheduled notifications via `tauri-plugin-notification`'s schedule API. Most of step 11's plumbing is reusable for that — the permission flow, the in-memory dedup pattern, the notification-sending. The trigger mechanism would change.
- `due` is treated as fully optional throughout: detail panel deletes the field when empty, calendar/scheduler/cards all gracefully ignore missing or non-string dates.

**Step 10 added:**
- `@event-calendar/core` and `@event-calendar/day-grid` installed (Svelte 5 native, lightweight).
- `src/lib/calendar/CalendarAdapter.ts` — `CalendarEventInput` and `CalendarView` types. The "adapter" is conceptual: only `Calendar.svelte` imports the underlying lib, so swapping is a one-file change.
- `src/lib/calendar/event-calendar.d.ts` — module declarations since the package ships no types.
- `src/lib/components/Calendar.svelte` — wraps `createCalendar`/`destroyCalendar`. Options is a `$state` proxy so EC's internal options-diff effect picks up changes; `$effect` rewrites `calOptions.events` whenever the parent's events prop changes. `.ec-dark` class enables EC's built-in dark theme; small CSS overrides push background/borders to match the rest of the app.
- `src/routes/calendar/+page.svelte` — derives events from `tasks.entries` (only those with a `due` frontmatter field). Title falls back to filename. Priority maps to event color (high=red, medium=amber, low=blue, none=neutral). Clicking an event sets `ui.openTaskPath`, opening the detail panel over the calendar.
- Layout: new "Calendar" link at the top of the sidebar nav, with active highlighting.

**Step 9 added:**
- `src/lib/utils/notePath.ts` — `noteRelativePath`, `noteHref`, `decodeNoteRouteParam`, plus `buildNoteTree` that turns a flat list of `VaultEntry` into a folder tree with files. Folders sort before files at each level, alphabetical. The display name strips `.md`; the relative path keeps it.
- `src/lib/stores/notes.svelte.ts` — `notesStore` with `entries: SvelteMap<path, VaultEntry>`, `isLoaded`, `error`, plus a `$derived` `tree`. Methods: `loadFromVault`, `save` (same hash-before-write flow as tasks), `upsert`, `remove`. Filters `readVault` output to `kind === "note"`.
- `src/lib/components/NotesTree.svelte` — recursive sidebar tree. Folders are buttons that toggle an `expanded: Set<string>` via `bind:expanded`. Files are anchor links to `/notes/<encoded path>`. Active note highlighted from `page.url.pathname`.
- `src/lib/components/NoteView.svelte` — full-area editor for the main content region. Title input + edit/preview toggle. Same lazy body load + debounced autosave + conflict banner + checkbox toggle as `TaskDetailPanel`. Re-loads when `path` prop changes (no `{#key}` here — handled internally with a `lastLoadedPath` effect).
- Route `src/routes/notes/[...path]/+page.svelte` — rest-parameter route, decodes the param to an absolute path under the vault and renders `NoteView`.
- Sync handler dispatches by `entry.kind`: tasks vs notes get upsert calls accordingly. `removed` events call both `tasks.remove` and `notes.remove` (no-op if not present).
- Layout: sidebar gains a "Notes" section under "Boards" with the recursive tree. `notes.loadFromVault(vault.path)` runs alongside `tasks.loadFromVault` and `boards.load`.
- Tests: `src/lib/utils/notePath.test.ts` adds 10 tests covering relative-path stripping, href encode/decode round-trips, single-file trees, nested folders, sort order, and `.md` stripping for display names. Total now 26 → **35 JS tests** + 4 Rust tests, all passing.

**Step 8 added:**
- CodeMirror 6 packages: `codemirror`, `@codemirror/state`, `@codemirror/view`, `@codemirror/lang-markdown`, `@codemirror/theme-one-dark`.
- `src/lib/components/CodeMirrorEditor.svelte` — wraps CM6 with markdown lang + one-dark theme + line wrapping. Plays nicely with parent-owned value (suppresses onChange when dispatching external value updates).
- `src/lib/components/TaskDetailPanel.svelte` — fixed right-side panel (40rem). Lazy-loads body via `vaultApi.readTaskBody`. Inline-editable frontmatter (title, priority, due, estimate, comma-separated tags). 300ms debounced autosave through `tasks.save`, which registers the hash so the watcher echoes back as a no-op. Sets `frontmatter.updated` to today's date on every save. Flushes pending save on close.
- `src/lib/stores/syncEvents.svelte.ts` — reactive `externalChange = { path, ts }` store. `sync.ts` updates it whenever an external (non-deduped) change is detected.
- Conflict banner: when an external change for the open path arrives while the panel is dirty, an amber banner appears with "Reload" (re-read body + reset drafts) and "Keep mine" (dismiss banner; next save overwrites).
- `Card.svelte` is now keyboard-accessible (role=button, tabindex, Enter/Space) and clicking opens the panel via `ui.openTaskPath`.
- Layout: `Escape` closes the panel; `{#key ui.openTaskPath}` ensures the panel fully remounts when switching tasks.

**Step 8 polish (post-feedback):**
- Panel slides in/out via `transition:fly` on a wrapper (`x: 640, duration: 220, easing: quintOut`). The wrapper holds the fixed positioning; the panel itself is just `h-full w-[40rem]`. `{#key}` is inside the wrapper so switching cards doesn't re-trigger the slide animation.
- Click outside the panel closes it. `src/lib/utils/clickOutside.ts` is a Svelte action that takes a `callback` and an optional `ignore` selector. Cards have `data-card`, so clicking another card swaps the panel content instead of closing.
- Body shows as **rendered Markdown by default**, with an `edit` toggle in the header (or double-click / Enter to enter edit mode). Uses `marked` (gfm) + `@tailwindcss/typography` (`prose prose-invert`) for the rendered view; CodeMirror is only mounted when in edit mode. See "Markdown editor alternatives" further down for the rationale and future options.
- Sync-loop fix: `tasks.save` now computes SHA-256 in JS via `src/lib/utils/hash.ts` and registers the hash in `writeHashes` **before** `vaultApi.writeTask`. This eliminates the race where the watcher fired before the hash was registered, which was producing false-positive "external change" banners on every in-app save. New test: `registers the hash before writing, so a racing watcher event still dedupes`.

**Step 7 added:**
- `svelte-dnd-action`, `fractional-indexing`, `js-yaml` (+ `@types/js-yaml`) installed.
- `src/lib/utils/yaml.ts` — `buildTaskContent(frontmatter, body)` serializes frontmatter via `js-yaml` and assembles a full file.
- `src/lib/utils/order.ts` — `compareOrder`, `getOrder`, `sortCards` (orders by `frontmatter.order`, then path).
- Components in `src/lib/components/`:
  - `Card.svelte` — title, optional priority pill, tags, subtask count
  - `Column.svelte` — wraps a `dndzone`, emits `consider`/`finalize` callbacks
  - `Board.svelte` — owns `columnsState` mirroring `tasks.entries` filtered by board; on finalize, computes neighbor-derived order via `generateKeyBetween` and either (a) writes only the moved card for same-column reorder, or (b) `moveTask` + `save` for cross-column moves.
- Route: `src/routes/boards/[board]/+page.svelte` renders `<Board name={...} />`.
- Layout: sidebar boards are now anchor links to `/boards/<encoded-name>`, with active-board highlight derived from `page.url.pathname`.
- Tests: `src/lib/utils/order.test.ts` adds 7 tests covering compareOrder, sortCards (ordered + nullish), getOrder. Total: 16 JS tests + 4 Rust tests, all passing.

**Step 7 follow-up (empty columns):**
- New Rust command `list_boards(vaultPath)` walks `<vault>/boards/<board>/<column>/` and returns `BoardLayout[]` (board name + columns from directory listing, not file derivation).
- `boards` store is now self-loading via `vaultApi.listBoards`, not `$derived` from tasks.
- `Board.svelte` seeds `columnsState` from the layout first, then fills cards from `tasks.entries`. Empty columns persist as long as their directory exists.
- Sync handler refreshes `boards` on each watcher event so external folder changes (Claude Code creating a new column dir, for example) appear in the UI.

**Known step-7 limitations (deferred):**
- No "add card / column / board" UI yet.
- No "delete card / column / board" UI yet (filesystem ops would do it; no UI affordance).
- Card click does nothing yet (detail panel is step 8).

**What's wired up so far:**
- Project scaffold builds and type-checks cleanly
- App shell: sidebar (`w-60`, dark) with "Silex" header (shows vault basename when loaded), main content area, bottom terminal panel
- Terminal panel hidden by default, `⌘ J` toggles it (Ctrl on non-Mac), close button in panel header. (Originally specced as `Cmd+\``, swapped to `Cmd+J` because backtick is awkward on non-US keyboards.)
- Full `uiStore` at `src/lib/stores/ui.svelte.ts` with `terminalOpen`, `activeBoard`, `openTaskPath`, `paletteOpen`, `searchOpen`
- Tauri plugins: `tauri-plugin-dialog`, `tauri-plugin-store`, `tauri-plugin-notification`
- `vaultStore` at `src/lib/stores/vault.svelte.ts` with `path`, `isLoaded`, `load()`, `set()`, `clear()`
- First-launch modal `src/lib/components/VaultSetup.svelte` shown when `isLoaded && !path`
- Rust commands in `src-tauri/src/commands.rs`:
  - `read_vault(path)` → `Vec<VaultEntry>`. Walks the vault, skips `/templates`, classifies entries as `task` (under `/boards/<board>/<column>/<file>.md`) or `note` (any other `.md`). Returns frontmatter + subtask counts; **never** the body. Path is canonical for board/column.
  - `read_task_body(path)` → body string (frontmatter stripped via `gray_matter`).
  - `write_task(path, content)` → SHA-256 hex of bytes written. Atomic: temp file in same dir + `persist()` rename. Caller is responsible for full file content (frontmatter + body).
  - `move_task(from, to)` → file rename, with copy-then-delete fallback for cross-device moves.
  - `delete_task(path)` → file deletion.
- Thin TS wrapper `src/lib/api/vault.ts` exporting `vaultApi.{readVault,readTaskBody,writeTask,moveTask,deleteTask}` and a `VaultEntry` type.
- Demo `greet` command removed.
- `tasksStore` at `src/lib/stores/tasks.svelte.ts` — `SvelteMap<path, VaultEntry>`, `loadFromVault(path)`, `save(path, content)`, `upsert`, `remove`. `save()` writes via `vaultApi.writeTask`, registers the returned hash in `writeHashes`, then re-reads the entry to refresh local state.
- `boardsStore` at `src/lib/stores/boards.svelte.ts` — `$derived` from `tasks.entries`. Returns `{ name, columns: string[] }[]`, alphabetically sorted (column ordering will need a board-config file later — currently just alphabetical).
- `writeHashes` at `src/lib/stores/writeHashes.ts` (plain TS, not reactive) — `Map<path, hash>`. Set on every internal write; checked by the sync handler.
- Layout effect: when `vault.path` is set, automatically calls `tasks.loadFromVault(vault.path)` and `vaultApi.watchVault(vault.path)`. Sidebar shows real boards from `boards.list` (with column count), or "Loading…" / "No boards yet" / error states.

**Sync loop (step 6):**
- Rust `watch_vault` command uses the `notify` crate. Watcher state is a `Mutex<Option<RecommendedWatcher>>` managed by Tauri; calling `watch_vault` again replaces the previous watcher.
- For every `.md` file change, Rust emits a `vault:changed` event with `{ path, hash, kind }`. Hash is SHA-256 hex of the current file bytes (or `null` for `removed`).
- Rust `read_entry(vaultPath, path)` returns one parsed `VaultEntry` so we can refresh a single file without rescanning the vault.
- Frontend `src/lib/sync.ts` exports `handleVaultChange(event)` (testable) and `startSync()` (sets up the listener). On each event:
  - `removed` → `tasks.remove(path)` and `writeHashes.delete(path)`
  - `created`/`modified` with hash matching `writeHashes` → ignore (own write)
  - `created`/`modified` with non-matching hash → `vaultApi.readEntry` then `tasks.upsert`
- `startSync()` is called once on layout mount; `unlisten()` is returned from `onMount` to clean up.

**Tests (step 6):**
- Vitest configured at `vitest.config.ts` with `sveltekit()` plugin and `jsdom` env. Scripts: `npm test` (run once), `npm run test:watch` (watch).
- `src/lib/sync.test.ts` — 9 tests covering: removed event, hash dedup, external refresh, created event, no-vault case, error swallowing, `tasks.save()` flow, and that a save-then-watcher-event round trip is correctly deduped.
- `src-tauri/src/commands.rs` `#[cfg(test)] mod tests` — 4 tests: subtask counting (mixed list styles), hash determinism, path classification (task and note).
- All 13 tests passing. Run with `npm test` and `cd src-tauri && cargo test`.

**Files of note (current state):**
- `src/routes/+layout.svelte` — app shell + vault load + tasks load + watch_vault + startSync + sidebar with real boards
- `src/routes/+page.svelte` — home placeholder, shows vault path
- `src/lib/stores/ui.svelte.ts` — full UI store
- `src/lib/stores/vault.svelte.ts` — vault store
- `src/lib/stores/tasks.svelte.ts` — tasks store (`SvelteMap` + `save()`)
- `src/lib/stores/boards.svelte.ts` — boards store (`$derived` from tasks)
- `src/lib/stores/writeHashes.ts` — write-hash bookkeeping (non-reactive)
- `src/lib/components/VaultSetup.svelte` — first-launch modal
- `src/lib/sync.ts` — `handleVaultChange()` + `startSync()`
- `src/lib/sync.test.ts` — vitest tests
- `src/lib/api/vault.ts` — TS wrapper for Rust commands + `VaultEntry` type
- `src-tauri/Cargo.toml` — `walkdir`, `gray_matter`, `sha2`, `tempfile`, `notify`
- `src-tauri/src/commands.rs` — 7 Rust commands + `WatcherState` + Rust unit tests
- `src-tauri/src/lib.rs` — Tauri builder, plugin registration, managed `WatcherState`, `invoke_handler!`
- `src-tauri/capabilities/default.json` — grants `dialog:default`, `store:default`, `opener:default`
- `vitest.config.ts` — vitest config with sveltekit plugin and jsdom env

**VaultEntry shape (TS side):**
```ts
{ path: string,
  kind: "task" | "note",
  board: string | null,
  column: string | null,
  frontmatter: Record<string, unknown> | null,
  subtaskTotal: number,
  subtaskDone: number }
```

**Known leftover scaffolding to clean up later:**
- macOS title bar still shows light system bar over dark UI. Tried during step 8 polish, reverted because nothing landed cleanly:
  - `"theme": "Dark"` on the window — no visible effect on macOS title bar (theme appears to be a Windows-mostly knob).
  - `"titleBarStyle": "Overlay"` (+ `hiddenTitle: true`) — does remove the white bar, but the window becomes undraggable: neither `data-tauri-drag-region` nor an explicit `getCurrentWindow().startDragging()` mousedown handler made the sidebar header into a drag handle.
  - Properly tackling this is part of step 15 (theming): full CSS-variable theme system + drag handle that survives an overlay title bar.

**Polish queue (small targeted follow-ups, not blocking main steps):**
- ~~Custom column order per board~~ Shipped. Per-board `_silex.json` (in `<vault>/boards/<board>/_silex.json`) holds `{ "columns": ["backlog", "in-progress", "done"] }`. `list_boards` merges it in: listed columns first in that order, unlisted columns appended alphabetically. New `set_board_column_order` and `create_column` commands write the file. Frontend column reorder is native HTML5 DnD on the column header (cursor: grab); drop on another column inserts before it, drop on the trailing "Add column" zone moves to end. "Add column" button at the end of the columns row reveals an inline input that creates a new column folder and appends it to the order.
- ~~Add board / note / notes-folder UI affordances~~ Shipped: hover-revealed `+` icon next to "BOARDS" creates a board (with a default `backlog` column); two icons next to "NOTES" create a note or a folder. Inline-input pattern (`CreateInput.svelte`) handles Enter/Esc/blur. Three command-palette actions ("New board…", "New note…", "New notes folder…") set `ui.creating` to focus the same sidebar input. Backed by Rust commands `create_board` / `create_note` / `create_note_folder` with path-traversal validation, conflict detection, and 13 Rust tests.
- Add card / new-column UI affordances (still pending).
- **Home-page ASCII title visual sweep.** The SILEX banner in `+page.svelte` uses Unicode box-drawing characters at a small font size; some rows still don't align perfectly across all platforms / fonts. Worth revisiting with a different font, a sized SVG, or a simpler ASCII variant.
- Delete card / column / board / note / folder UI affordances (still pending).
- Rename UI for any of the above (still pending).
- **Time-based reminders** (separate from due-date notifications). Add a `reminders` array per task with `{ at: "2026-05-10T14:30", notified?: bool }`, schedule via the OS-level scheduling API of `tauri-plugin-notification` (so reminders fire even when the app is closed) or extend our in-app scheduler with finer granularity. Reuses the permission flow and notification-sending plumbing from step 11.
- **Terminal font with broader glyph coverage.** Current font (`ui-monospace, "SF Mono", Menlo, monospace`) lacks some special characters used by Claude Code and other TUI tools (rendered as `?`). Options: bundle a Nerd Font, use JetBrains Mono / Fira Code via `@fontsource`, or add a settings field where the user picks their preferred terminal font. Easy win once we have a settings UI.
- **Persist terminal panel height** across app restarts via the Tauri store plugin. Right now it resets to 240px each launch.
- **Calendar doesn't fill the available height.** The grid renders ~5 rows of natural height and leaves the area below empty. Things tried that didn't fix it: setting `height: '100%'` on the EC options, making `<main>` a flex column with `flex flex-col min-w-0`, changing the wrapper from `h-full` to `flex-1 min-h-0`, making the wrapper itself a flex column with `.ec { flex: 1 1 0%; min-height: 0 }`. EC's mounted `.ec` element seems to internally cap at content height regardless of parent. Worth investigating EC's source for how it sizes month-view rows (it may compute row height from a separate `--ec-day-height` or auto-size based on visible cells). If we adopt week view too, this might naturally fix itself with `height: 'auto'` plus an aspect ratio. Tackle this when we revisit calendar polish.

## Markdown editor alternatives

Currently using **Option A** — a simple preview/edit toggle in `TaskDetailPanel`: rendered HTML by default (via `marked` + `@tailwindcss/typography`), CodeMirror 6 when in edit mode. Toggle button in the header; double-click or Enter on the preview also enters edit mode.

This is a deliberate choice that prioritizes **byte-perfect Markdown round-tripping** over Notion-style WYSIWYG. The reasoning: if Claude Code (via the embedded terminal in step 12) or the user's external editor touches the same `.md` files, any reformatting on save would produce noisy diffs and cause the conflict-detection banner to fire constantly.

If we ever revisit the editor experience, here are the three options on the table, in increasing cost:

### Option A — Preview/edit toggle *(current)*
- **Effort**: shipped.
- **Pros**: Bytes preserved exactly. Zero risk of drift across the watcher / Claude Code / external editors. CodeMirror gives a real text editor when you need to edit syntax-heavy content.
- **Cons**: Not Notion-like. Two modes, requires a deliberate switch. Editing feels slightly heavier than a "just type" experience.

### Option B — Switch the editor to Milkdown + Crepe
- **Effort**: 2–3 days.
- **What it gets you**: A polished Notion-style editor essentially for free. Slash commands, inline rendering of Markdown as you type, tables, embeds. ProseMirror under the hood, so the document model is rich.
- **Pros**: Best out-of-the-box UX of any option. Mature, maintained, used by other Markdown-as-database apps.
- **Cons**: ProseMirror serializes a tree to Markdown on save — the round-trip is **not byte-perfect**. Concrete consequences for this project:
  - `*foo*` may become `_foo_` (or vice-versa); trailing whitespace may shift; ordered list numbering may renumber.
  - Every time Claude Code edits a file then we open it in the editor and save, we'd produce a diff even if no semantic change was made.
  - The conflict banner would fire more often than it should.
  - Mitigations exist (force a specific syntax style on Crepe's serializer, normalize bytes before comparing in `writeHashes`) but they don't fully eliminate the issue.
- **When to pick this**: if user feedback is that "the editor feels clunky and that's the dealbreaker," and we accept that the embedded terminal / external-editor flow is a secondary use case.

### Option C — Live-preview decorations on top of CodeMirror
- **Effort**: 1–2+ weeks of dedicated extension authoring.
- **What it gets you**: An Obsidian-style editor where Markdown syntax markers (`**`, `#`, `> `) are hidden when the cursor isn't on that line, and the line renders styled. This is what Obsidian does internally.
- **Pros**: Bytes preserved. Notion-like feel for most content. Best of both worlds.
- **Cons**: Each Markdown construct (headings, emphasis, lists, code blocks, links, blockquotes, task checkboxes, tables, fenced code with syntax highlighting) is its own CodeMirror extension with its own edge cases. Existing community packages (`@codemirror/lang-markdown` itself, `codemirror-rich-markdoc`, etc.) only cover a fraction of this. Obsidian has 5+ years of polish on theirs and still has rough edges.
- **When to pick this**: only if the editor becomes the core differentiator we want to spend ongoing effort on. For a kanban app, this is almost certainly not worth it.

**Decision rule going forward**: stick with Option A unless we get explicit, repeated feedback that the toggle is the thing standing in the way of using the app. If we do switch, jump straight to Option B; do not attempt Option C unless the editor is the product.

**Not yet tested end-to-end:** the Rust commands compile cleanly but haven't been called from the UI yet. Step 5 (Svelte stores) is where they get exercised.

## Resuming a session

```bash
cd ~/projects/silex
. "$HOME/.cargo/env"     # if cargo not on PATH
npm install              # if node_modules missing
npm run check            # type check
npm run build            # frontend build
npm run tauri dev        # full Tauri app (opens a window)
```

To pick up where the previous session left off: read this file, look at `## Current status` and the implementation order checkboxes. The next unchecked step is what to work on. Confirm scope with the user before starting.
