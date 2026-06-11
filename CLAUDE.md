# Silex

Lightweight desktop kanban + notes app. Markdown files are the database; the app is a fast view over them. Cross-platform via Tauri 2; primary target is macOS. Designed to be scriptable by Claude Code through an embedded terminal that has full access to the vault.

This file is the live source of truth for project state and forward-looking plans. Long-form rationale, per-step build notes, and historical decisions live in `decision-log.md` — read that only when you need the *why* behind something.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Tauri 2 |
| Frontend | SvelteKit (adapter-static, SPA mode) + Svelte 5 + TypeScript |
| Build tool | Vite 6 |
| Styling | Tailwind v4 (`@tailwindcss/vite`) |
| Kanban DnD | svelte-dnd-action |
| Calendar | `@event-calendar/core` (DayGrid + Interaction) |
| Markdown editor | CodeMirror 6 with custom Obsidian-style live-preview decorations |
| Code highlighting | `@codemirror/language-data` + per-language packages (lazy chunks) |
| Frontmatter | `gray_matter` (Rust read) + `js-yaml` (TS write) |
| Fractional ordering | `fractional-indexing` |
| Terminal | xterm.js + `portable-pty` |
| File watching | `notify` crate |
| Notifications | `tauri-plugin-notification` |
| Persistent prefs | `tauri-plugin-store` |
| Soft-delete | `trash` crate |
| Reveal in Finder | `tauri-plugin-opener` (`opener:allow-reveal-item-in-dir` only) |
| Bundled font | JetBrains Mono Nerd Font Mono (Regular + Bold) |

## File structure philosophy

The user-selected vault folder is the database. No external storage.

```
/vault
  /boards
    /<board>
      _silex.json            # column order
      /<column>
        <task-slug>.md
  /reminders
    <reminder>.md
    /past
      <fired-reminder>.md
  /templates                 # not exposed in UI
  /attachments               # pasted images; not exposed in UI
  ...freely organized .md notes anywhere else
```

Rule: anything under `/boards/<board>/<column>/` is a kanban task. Anything under `/reminders/` is a reminder. Any other `.md` file is a note. **Path is canonical** for board/column/status — frontmatter is rewritten to match on read, never wins over path.

## Sync loop

Hash-based dedup eliminates write/watcher race conditions. On every internal write we compute SHA-256 of the bytes, register it in `writeHashes[path]`, then write atomically (temp file + rename). On every watcher event we hash the file and compare: match → ignore (own write); mismatch → external change. External changes either silently reload (panel clean or closed) or surface a non-blocking *"File changed on disk — Reload / Keep mine"* banner if the open panel is dirty. We never auto-overwrite.

## Implementation order

The original 15-step build is complete; everything below is post-v1 polish tracked in the phased backlog plan.

- [x] **1. Scaffold** — Tauri 2 + SvelteKit + Svelte 5 + TS + Vite + Tailwind v4
- [x] **2. App shell** — sidebar + main + bottom terminal panel (`Cmd+J`)
- [x] **3. Vault selection** — first-launch modal, native picker, persisted via store plugin
- [x] **4. Rust commands** — `read_vault`, `read_task_body`, `write_task` (atomic, returns hash), `move_task`, `delete_task`
- [x] **5. Svelte stores** — `vault`, `boards`, `tasks`, `notes`, `reminders`, `ui`, `writeHashes`
- [x] **6. Sync loop + integration tests** — `watch_vault` + hash dedup + reconciliation
- [x] **7. Kanban board** — svelte-dnd-action + file moves + fractional ordering
- [x] **8. Task detail panel** — lazy body load, CM6 editor, debounced autosave, conflict banner
- [x] **9. Notes** — sidebar tree + full-area editor
- [x] **10. Calendar view** — read-only over due dates, behind a `CalendarAdapter`
- [x] **11. Notifications** — `tauri-plugin-notification` + 15-min interval
- [x] **12. Embedded terminal** — `portable-pty` + xterm.js (real PTY)
- [x] **13. Command palette** — `Cmd+P` (nav) + `Cmd+Shift+P` (commands)
- [x] **14. Search overlay** — `Cmd+Shift+F`, full-text across title + frontmatter + body
- [x] **15. Theming + keyboard shortcuts** — CSS-variable theme system, system/light/dark switcher

## Key decisions

| Decision | Reason |
|---|---|
| **SvelteKit over plain Svelte+Vite** | File-based routing pays off for boards/notes/calendar. ~10–20KB overhead is negligible. |
| **Path canonical for board/column/status** | Eliminates filesystem ↔ frontmatter drift. Path wins; frontmatter is rewritten to match. |
| **CodeMirror 6 + custom live-preview decorations (Option C)** | Byte-perfect by construction — decorations are display-only, `state.doc.toString()` is exactly what the user typed. The multi-tool workflow (Claude Code in the terminal + external editors writing the same `.md` files) makes byte drift a hard no. ProseMirror-based editors (Milkdown/Crepe) were rejected for tree-serialise-on-save churn. See `decision-log.md` for the full journey. |
| **Hash-based watcher dedup, not timer** | Timers have race windows (FSEvents fires late, coalesces). Content hash is deterministic. |
| **Notes added to v1 scope** | Cheap (~1 week extra); reuses sync loop, watcher, editor. |
| **No Google Calendar sync** | Cut from v1. Calendar is read-only over local due dates. Removes OAuth, secrets, conflict resolution. |
| **No secrets storage layer** | Without GCal, no credentials needed. Tauri store plugin (plain JSON) is enough. |
| **Real PTY required for terminal** | Claude Code, vim, lazygit need a TTY for ANSI rendering and interactive prompts. `portable-pty` is cross-platform. |
| **Personal email for git** | Local config: `user.email = jadelriga@gmail.com`. |

## Non-goals (v1)

Cloud sync. Multi-user. Mobile app. App Store distribution. Plugin system. Calendar-grid expansion of recurring reminders (the reminders themselves recur since Phase 14; the calendar shows only the next occurrence). External calendar sync (Google etc.). Encrypted secrets storage.

## Phased backlog plan

Forward-looking grouping of post-v1 polish work. Each phase is roughly one sitting; iterations within a phase are commit boundaries. Update the checkboxes as items land.

### Phase 1 — Right-click affordances + delete + rename
- [x] **Iter 1 — Primitives + delete.** `withContextMenu` Svelte action, `contextMenu` singleton store, `ContextMenu.svelte` overlay (auto-flip), `confirm` singleton store, `ConfirmDialog.svelte`. Rust `delete_path` (soft-delete via `trash` crate) and `delete_column` (also rewrites `_silex.json`). Wired Delete… on boards, columns, cards, notes, note folders, reminders.
- [x] **Iter 2 — Rename.** Inline rename via context menu for boards (sidebar), columns (header), notes and note folders (sidebar). Rust `rename_column` + frontend `vaultApi.movePath` for everything else; `_silex.json` stays in sync. Cards/reminders use the title field in their detail panel for now (no double-click rename gesture). Watcher rename-pair detection still TODO — see `rename-ui-affordances` task.

### Phase 2 — Foundation polish
- [x] **Persist terminal panel height** — `settings.svelte.ts` reads `terminalHeight` on mount, drag-resize clamps to `[80, innerHeight - 120]` and saves on `mouseup`. Default 240px when unset; no flash since terminal is closed by default at launch.
- [x] **Scaffold cleanup** — removed `static/vite.svg`, `tauri.svg`, `svelte.svg`, and the originally-unused `tauri-plugin-opener` dep (later re-added minimally for Reveal in Finder).
- [x] **SILEX home banner** — closed without changes; existing Unicode box-drawing banner is acceptable. Revisit if it ever looks broken on a target platform.

### Phase 3 — Settings + terminal quality of life
- [x] **Native menu bar.** `src-tauri/src/menu.rs` builds Silex / File / Edit / View / Window with accelerators on items the JS already handled. Items emit `menu:<id>` events; `menuListener.ts` `startMenuListener(actions)` listens and dispatches in the layout's `onMount`. JS keydown handlers for the moved shortcuts removed (only Esc-closes-task-panel stays in JS).
- [x] **Settings modal + Reveal settings file.** `SettingsModal.svelte` opens via Cmd+, (Preferences… in the Silex menu). Theme section + Reveal in Finder button. Two palette actions and a File menu item mirror the modal entry points. Settings live in `settings.json` under `appDataDir()` — never visible in the sidebar since it's outside the vault. Re-added `tauri-plugin-opener` with only `opener:allow-reveal-item-in-dir`.
- [x] **Terminal glyph coverage.** Bundled JetBrains Mono Nerd Font Mono (Regular + Bold, ~4.7MB) under `static/fonts/`. `@font-face` + `--font-mono` token override; explicit rule forces `.cm-editor` onto the same family. Required a separate fix in `pty.rs` (`drain_valid_utf8`) so multi-byte UTF-8 sequences split across PTY read boundaries don't get replaced with U+FFFD before reaching xterm — that fix unlocked all subsequent glyph fidelity, see commit b73a2e8.
- [x] **Persistent terminal session.** `<Terminal />` lazy-mounts on first open via `terminalEverOpened` and stays mounted; subsequent toggles flip `class:hidden`. PTY survives panel close; session ends only on app quit.

### Phase 4 — Search + calendar polish
- [x] **Highlight search matches** — `highlightMatches` util wraps each token occurrence in `<mark class="search-hit">` (HTML-escaped, case-insensitive, regex-special-chars escaped, longer tokens preferred when overlapping). Translucent amber bg works on both themes.
- [x] **Search filter chips** — `FilterChip.svelte` reusable component (single + multi select). Board / Kind / Priority / Tags / Reminder chips above the search input. `searchEntries(entries, bodies, query, filters)` extended with a `SearchFilters` shape; empty query + active filter lists everything that passes the filter. Single shared `openChipId` in the parent so opening one popup closes the others. Two non-obvious bugs surfaced: (1) `let open = $state(...)` shadowed `window.open` and silently no-op'd writes — renamed to `popoverOpen`; (2) Svelte 5 mounts the popup synchronously on state change, so `use:clickOutside` was firing on the same click that opened the popup — fixed with `e.stopPropagation` on the chip trigger.
- [x] **Calendar fills available height.** Set `dayMaxEvents: true` in EC options. EC's day-grid CSS gates the `.ec-uniform` class on this option — uniform switches `--ec-row-height` from `auto` (content height) to `minmax(0, 1fr)` and adds `flex-grow: 1` so the grid fills the container. Side-effect: cells that overflow get a "+N more" link instead of stretching the row. Same commit also fixed a date-click bug (EC's `dateStr` is `YYYY-MM-DDTHH:MM:SS`, but `<input type="date">` needs `YYYY-MM-DD` — sliced to the first 10 chars in the click handler so the New Reminder dialog now pre-fills the clicked day instead of today) and added `cursor: pointer` to day cells and events.

### Phase 5 — Keyboard + notification UX
- [x] **Quick-create shortcuts.** Added `New Task` File-menu item; `Cmd+N` creates a note (matches macOS convention) and `Cmd+Shift+N` creates a task in the active board's leftmost column. New-board accelerator left at `Cmd+Shift+B`. The `addingCardInColumn` ui state replaces Column's local `adding` so the menu shortcut and the per-column "Add a card" button share one source of truth — only one column can be in adding-mode at a time. No-op when not on a board route.
- [x] **Click-notification → focus task** — resolved in Phase 13 via our own `UNUserNotificationCenter` layer (`notify_mac.rs`). The original blockers stand for dev mode only: a bare `tauri dev` binary has no bundle id, so the native path is gated off there and notifications fall back to the plugin (fire-and-forget, wrong attribution). Bundled builds get correct icon + click-to-open.
- [ ] **Arrow-key card nav** (`arrow-key-card-nav` task). Non-trivial focus model with svelte-dnd-action — likely needs a dedicated focus-ring abstraction.

### Phase 6 — Live-preview markdown editor (Option C)

User decision (2026-05-03): replace the preview/edit toggle with an Obsidian-style live-preview editor built on CodeMirror 6 + Lezer decorations. Spec was at `<vault>/boards/silex-backlog/.../explore.md`. **Hard requirement met: byte-perfect preservation** — the document in CM6 stays as raw markdown; decorations are display-only.

- [x] **Iter 1 — Skeleton + minimum scope.** Bold, italic, inline code, ATX headings, links, images via `ViewPlugin.fromClass` + `RangeSetBuilder<Decoration>` walking the Lezer tree per `view.visibleRanges`. Line-based cursor proximity for marker reveal. Image widget uses `convertFileSrc` for relative/`file://` paths only.
- [x] **Iter 2 — Extended scope.** GFM via `markdown({ base: markdownLanguage })`. Task checkboxes via `CheckboxWidget` (CM6 transaction-based toggle, `e.stopPropagation` so the panel's clickOutside doesn't fire when the widget rebuilds). Bullet/ordered lists (raw markers, dimmed). Blockquote with left border + indent (italic suppressed). `Tab`/`Shift+Tab` indent via `indentWithTab`. Selection background lifted to a brighter blue so it's visible on `surface-2`.
- [x] **Iter 3 — Toggle removal + look-and-feel.** Deleted `MarkdownPreview.svelte`, `src/lib/utils/checkbox.ts` + tests, removed `marked` + `@tailwindcss/typography`. Editor body uses `--color-surface-deep`; body text pure white in dark, pure black in light. Headings, blockquote, code-info language tag overridden via `.cm-editor.cm-editor` + descendant `!important` so they win against oneDark's wrapping spans. Active-line highlight set to `surface-1`. Fenced code refactored to per-line decorations (`Decoration.line`) with first/last classes for unified rounded box; the ``` fence delimiter lines hide when the cursor is outside the block.

### Phase 7 — Fenced code syntax highlighting

- [x] **Per-language syntax highlighting in fenced code blocks.** `markdown({ codeLanguages })` wired up with a curated list in `src/lib/editor/codeLanguages.ts` (filters `@codemirror/language-data` to the languages we've installed: JS/TS, Python, JSON, HTML, CSS, SQL, YAML, shell/bash, markdown, plus a custom `LanguageDescription` for Elixir via `codemirror-lang-elixir`). Vite splits each into its own lazy-loaded chunk. Custom `HighlightStyle` (`src/lib/editor/highlight.ts` — Tokyo Night-ish dark + Catppuccin Latte-ish light) replaces oneDark's built-in token colours for higher contrast.

### Phase 8 — Cross-platform readiness + CI/CD release pipeline

- [x] **Portability fixes + GitHub Actions release workflow.** Three iters: (1) bundle id set to `dev.silexmd`; menu refactored to gate the macOS-only Silex app submenu under `cfg(target_os = "macos")` and route Preferences into Edit on Win/Linux; `Cmd+,` → `CmdOrCtrl+,`; `pty.rs` adds a Windows shell fallback (`pwsh.exe` → `powershell.exe` → `%ComSpec%` → `cmd.exe`); single `is_invalid_segment` helper in `commands.rs` rejects backslash, trailing dot/space, and Windows reserved device names; new `src/lib/utils/platform.ts` with `fmtShortcut` so the palette + home page render `⌘ ⇧ N` on macOS and `Ctrl+Shift+N` on Win/Linux. (2) `.github/workflows/ci.yml` runs `svelte-check` + `vitest` + `cargo test` on every PR to main and every push to a non-main branch (single ubuntu-22.04 job, ~3–5 min, with concurrency cancellation). (3) `.github/workflows/release.yml` builds DMG (arm64 + x86_64) / MSI + NSIS / DEB + AppImage on `v*` tag push via a `tauri-apps/tauri-action@v0` matrix, uploads to a draft GitHub Release; nothing auto-published. README updated with per-OS install + Gatekeeper/SmartScreen workarounds for the unsigned builds + Linux baseline (Ubuntu 22.04+ for webkit2gtk-4.1) and inotify-watch-limit / case-sensitivity caveats. Code signing and notarization deferred (would need Apple Developer + Windows code-signing certs).

### Phase 9 — Style improvements + bug fixes

- [x] **`style-improvements` task** — shipped in two iters. Iter 1: dropped the saved/unsaved/saving header pill (autosave is reliable enough that the indicator was just noise); productName + window title `silex` → `Silex` so the macOS app menu and title bar reflect the proper case; sidebar `Silex` header is now an anchor to `/`; home-page shortcut hints refreshed to the post-Phase-3-and-5 set (8 shortcuts incl. quick switcher / run command / new note / new task / preferences). Iter 2: task panel header has copy-path / maximize / cross-close icon buttons; new singleton `toast.svelte.ts` + `Toast.svelte` for transient feedback (used by both copy-path buttons); panel is now resizable via a left-edge drag handle clamped to `[320px, viewport-240]` and persisted via `settings.taskPanelWidth`; maximize fills the right pane (sidebar stays visible). Three subtle bugs fixed: aside had a hardcoded `w-[40rem]` so dynamic-width changes only moved the panel — switched to `w-full`; copy/maximize/close button clicks were closing the panel because Svelte re-renders detached the click target before `clickOutside` checked containment — `e.stopPropagation()` on each handler; the resize handle is outside the aside, so its post-drag click was firing `clickOutside` — `onclick={e => e.stopPropagation()}` on the handle.
- [x] **`fix-rename-bug-in-notes-directories` task** — root cause was the macOS watcher path: FSEvents fires events at the directory level when a directory is renamed (the file inodes inside don't move), and our `emit_change` in `commands.rs` filters to paths ending in `.md` so directory rename events never reach the frontend. The `notes.entries` cache kept the old paths forever, so the tree rendered both the old and new folders. Fixed by adding `notes.renameFolderPath(oldAbs, newAbs)` (and a matching one on `bodies`) that the rename UI calls in lockstep with `vaultApi.movePath` to repaint affected entries + body cache + the expanded set. The `rename-ui-affordances` to-do's "watcher rename-pair detection" concern is now moot for directories. (External directory renames via terminal/Finder are still a gap — defer.)

### Phase 10 — Local image rendering + paste-from-clipboard

- [x] **Local images in the live-preview editor.** The existing `ImageWidget` only worked for `https?://`/`data:` URIs — the asset protocol was never enabled (no `protocol-asset` cargo feature, no `assetProtocol` config) and relative paths went to `convertFileSrc` unresolved. Fixed: `assetProtocol` enabled with an **empty static scope**; `watch_vault` grants `asset_protocol_scope().allow_directory(vault, true)` at runtime on every vault open (vault-only — images outside the vault 404 by design, the scope is the security boundary). New pure util `src/lib/utils/imagePath.ts` (`resolveImageSrc`/`dirnameOf`: percent-decoding, `#`/`?` suffix stripping, `.`/`..` normalization, Windows `\` separators; leading `/` = vault-rooted, else relative to the note's dir); `convertFileSrc` applied only at the edge in `livePreview.ts`. Context reaches the editor via an `imageContext` Facet holding a **getter closure** (set once at construction; reads the reactive `path` prop + `vault` store, so file switches need no reconfiguration — the doc replacement triggers the decoration rebuild). `CodeMirrorEditor` gained a `path` prop, passed by `TaskDetailPanel` + `NoteView`.
- [x] **Paste image from clipboard.** `EditorView.domEventHandlers({ paste })` detects `image/*` clipboard items (text paste unaffected), saves bytes via new Rust `save_attachment` and inserts `![](/attachments/<name>)` at the cursor. The command is **sync** (`tauri::ipc::Request` is borrowed; async commands need `'static`) and takes the bytes as the **raw IPC body** — no JSON-encoding megabytes; the vault path travels percent-encoded in an `x-vault` header (header values must be ASCII), filename in `x-filename`. `do_save_attachment` core: validates the name with `is_invalid_segment` (unsafe → regenerated `pasted-<ms>.png`), collision-suffixes via `unique_path`, atomic temp-file+rename write, returns the vault-rooted path. `attachments/` is excluded from `list_note_folders` (like templates) so it never clutters the sidebar; the watcher's `.md` filter means image writes cause no sync churn.

### Phase 11 — Small UX fixes

- [x] **Sidebar column counts removed.** The `(N)` next to each board name in the sidebar was noise; deleted. The command palette still shows "N columns" as a search hint — kept deliberately.
- [x] **Selection drags no longer close panels.** Users selecting text in the task panel would release the mouse outside it, and the browser dispatches that `click` on the *common ancestor* of press/release — outside the panel — so `clickOutside` closed it mid-selection. Fix in `clickOutside.ts`: a capture-phase `pointerdown` listener records where the gesture started; clicks whose press began inside the node are ignored. Applies to every `clickOutside` consumer (task panel, reminder popover, filter chips, context menus). Unit-tested incl. the drag-out case.

### Phase 12 — Structure cleanup + card affordances

- [x] **Shared `EntryStore` base.** `src/lib/stores/entryStore.svelte.ts` holds the entries-map + isLoaded/error lifecycle, `save` (hash-registered atomic write), `upsert`/`remove` once; `tasks` and `reminders` are now plain `new EntryStore(kind)` instances and `NotesStore` extends it, overriding the `refreshEntries`/`clear` hooks for its folders/tree extras. Net ~−120 lines of triplicated store code.
- [x] **`startEdgeResize` utility.** `src/lib/utils/panelResize.ts` replaces the two near-identical drag-resize handlers in the layout (task panel x-axis, terminal y-axis); unit-tested incl. clamping and listener teardown.
- [x] **Sidebar extracted from `+layout.svelte`.** New `src/lib/components/Sidebar.svelte` owns the boards/reminders/notes sections plus their create/rename/delete and notes-root drag/drop handlers; `activeBoardFromPathname` + `basename` moved to `src/lib/utils/routes.ts` (shared by layout menu actions and sidebar). Layout went 632 → ~310 lines.
- [x] **Reminder badges on cards.** Cards show a bell + compact date ("Jun 12", year added when ≠ current) when the task has a `reminder`; red when overdue, amber when due later today, subtle otherwise (`reminderStatus`/`formatReminderDate` in `reminder.ts`, unit-tested). Full datetime in the tooltip.
- [x] **Duplicate card.** Card context menu → "Duplicate card". Rust `duplicate_task` copies the file verbatim to a collision-suffixed `<stem>-copy.md` sibling (atomic temp+rename, no frontmatter re-serialisation so zero byte drift); the frontend then retitles the copy to "… (copy)" through the standard `tasks.save` path when a title exists. Same `order` key means the copy lands next to the original.

### Phase 13 — Reminder UX + native macOS notifications

- [x] **Inline month calendar for reminder pickers.** New `MonthCalendar.svelte` over a pure `calendarGrid.ts` (Monday-start 6×7 grid, unit-tested). Used always-visible in `NewReminderDialog` and in the task panel's `ReminderPopover` (replaces both native `<input type="date">`s). Past days are grayed/disabled (`min` prop); today is ringed; selected day accent-filled.
- [x] **Time defaults + past-blocking.** Opening a picker defaults to today + current time (`currentTimeHM`); clicking a different day sets 09:00; clicking back on today restores current time. Create/Set are disabled (with a hint) when the chosen datetime is past; the dialog re-checks the wall clock at submit since the derived flag goes stale if it sits open. Calendar-view clicks on past days clamp to today.
- [x] **Minute-aligned scheduler.** `setInterval(60s)` → chained `setTimeout` re-aimed at the next wall-clock minute boundary every tick (`msUntilNextMinute`, tested) + a `visibilitychange` catch-up check so reminders fire promptly after sleep/wake. Alignment is best-effort under WKWebView timer throttling.
- [x] **Native macOS notifications with click-to-open.** `notify_mac.rs`: `UNUserNotificationCenter` via `objc2-user-notifications` (same objc2 0.6 family tauri already pulls). `init` (in setup) registers a delegate + requests authorization — gated on `NSBundle` having a bundle id, so dev binaries skip it (the center traps without a bundle; this was the root of the old parked attempt). `notify_native(title, body, targetPath)` carries the entry path in `userInfo`; returns `false` when unavailable and the JS scheduler falls back to `tauri-plugin-notification`. Click → delegate stores the path in a pending slot, focuses the window on the main thread, emits `notification:clicked`. JS side (`notifyClick.ts`): live listener opens boards-tasks via board route + `ui.openTaskPath`, everything else via note view; cold-start clicks are pulled with `take_pending_notification_click` once tasks load. Reminders are moved to `past/` **before** notifying so the click target is the post-move path. **Only verifiable in a bundled `.app`** — dev mode keeps plugin behavior.
- [x] **Docs.** README macOS section + Settings modal (macOS-only) note: banner-vs-Alerts is a per-app user setting apps can't choose; stale notification icon = macOS cache (`killall NotificationCenter`).

### Phase 14 — Recurring reminders

- [x] **Single-file recurrence model.** `reminder:` always holds the *next* occurrence; `repeat:` (daily/weekly/biweekly/monthly/yearly) marks the series; `repeatFrom:` stores the creation-time anchor so "monthly on the 31st" clamps through short months (Feb 28) without permanently drifting. On fire, the scheduler rewrites `reminder` to the next occurrence and the file stays in `/reminders/` — it never moves to `past/`, so it's its own notification click target. Everything downstream (calendar next-occurrence, search reminder chips, sidebar) works unchanged.
- [x] **`recur.ts` pure util.** `parseRepeat` (junk-tolerant — hand-edited frontmatter degrades to no-repeat), `nextOccurrence(repeat, anchor, after)` (strictly-after semantics, calendar-component math so wall-clock time survives DST, month-end + leap-year clamping, multi-period catch-up in one step), `repeatLabel`. 13 unit tests.
- [x] **Scheduler.** Recurring branch notifies once then `advanceRecurring(entry, repeat, now)` — missed occurrences while the app was closed collapse into one catch-up notification. The in-session `fired` guard is released after the rewrite lands (else the next occurrence would never fire without a restart) and kept on failure (else a broken file notifies every minute). Notification body says "Repeats weekly" etc.
- [x] **UI.** Repeat select (default "No repeat") right of Time in the New Reminder dialog; Rust `create_reminder` gained `repeat: Option<String>` (validated against the five values, writes `repeat` + `repeatFrom`). Sidebar shows ↻ on recurring reminders; context menu gains "Skip next occurrence" (advances past the *scheduled* time via shared `advanceRecurring`); delete dialog notes it ends the whole series.
- [x] **Scope decisions (2026-06-10):** edits apply to the whole series — no per-occurrence exceptions (skip-next is the escape hatch); task reminders stay one-shot; missed-run catch-up = one notification. Calendar-grid expansion of future occurrences deferred (see non-goals).

## VaultEntry shape (TS side)

```ts
{ path: string,
  kind: "task" | "note" | "reminder",
  board: string | null,
  column: string | null,
  frontmatter: Record<string, unknown> | null,
  subtaskTotal: number,
  subtaskDone: number }
```

## Resuming a session

```bash
cd ~/projects/silex
. "$HOME/.cargo/env"     # if cargo not on PATH
npm install              # if node_modules missing
npm run check            # type check
npm test                 # vitest
npm run tauri dev        # full Tauri app
```

To pick up where we left off: scan the phased backlog plan for the first unchecked item, sanity-check against the corresponding task in `<vault>/boards/silex-backlog/to-do/`, and confirm scope with the user before starting.
