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

Cloud sync. Multi-user. Mobile app. App Store distribution. Plugin system. Recurring calendar events. External calendar sync (Google etc.). Encrypted secrets storage.

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
- [ ] **Click-notification → focus task** — *parked.* `tauri-plugin-notification` 2.3.x is fire-and-forget on desktop: `onAction` is mobile-only and `desktop.rs` emits no events on click, so the JS-side wiring can't receive anything. Tried bypassing it with `mac-notification-sys` directly + `set_application` (com.apple.Terminal in dev, com.silex.app in prod), with a worker thread per notification waiting on the blocking `send()` for `NotificationResponse::Click` — got muddled by macOS sender attribution (notifications appeared to come from Finder/Terminal in dev) and a permission prompt round trip. Reverted. Revisit when either upstream adds desktop click support OR when we have a proper `.app` bundle from `tauri build` to test against (dev-mode `cargo run` doesn't have a stable bundle id, which is the root of the attribution mess).
- [ ] **Arrow-key card nav** (`arrow-key-card-nav` task). Non-trivial focus model with svelte-dnd-action — likely needs a dedicated focus-ring abstraction.

### Phase 6 — Live-preview markdown editor (Option C)

User decision (2026-05-03): replace the preview/edit toggle with an Obsidian-style live-preview editor built on CodeMirror 6 + Lezer decorations. Spec was at `<vault>/boards/silex-backlog/.../explore.md`. **Hard requirement met: byte-perfect preservation** — the document in CM6 stays as raw markdown; decorations are display-only.

- [x] **Iter 1 — Skeleton + minimum scope.** Bold, italic, inline code, ATX headings, links, images via `ViewPlugin.fromClass` + `RangeSetBuilder<Decoration>` walking the Lezer tree per `view.visibleRanges`. Line-based cursor proximity for marker reveal. Image widget uses `convertFileSrc` for relative/`file://` paths only.
- [x] **Iter 2 — Extended scope.** GFM via `markdown({ base: markdownLanguage })`. Task checkboxes via `CheckboxWidget` (CM6 transaction-based toggle, `e.stopPropagation` so the panel's clickOutside doesn't fire when the widget rebuilds). Bullet/ordered lists (raw markers, dimmed). Blockquote with left border + indent (italic suppressed). `Tab`/`Shift+Tab` indent via `indentWithTab`. Selection background lifted to a brighter blue so it's visible on `surface-2`.
- [x] **Iter 3 — Toggle removal + look-and-feel.** Deleted `MarkdownPreview.svelte`, `src/lib/utils/checkbox.ts` + tests, removed `marked` + `@tailwindcss/typography`. Editor body uses `--color-surface-deep`; body text pure white in dark, pure black in light. Headings, blockquote, code-info language tag overridden via `.cm-editor.cm-editor` + descendant `!important` so they win against oneDark's wrapping spans. Active-line highlight set to `surface-1`. Fenced code refactored to per-line decorations (`Decoration.line`) with first/last classes for unified rounded box; the ``` fence delimiter lines hide when the cursor is outside the block.

### Phase 7 — Fenced code syntax highlighting

- [x] **Per-language syntax highlighting in fenced code blocks.** `markdown({ codeLanguages })` wired up with a curated list in `src/lib/editor/codeLanguages.ts` (filters `@codemirror/language-data` to the languages we've installed: JS/TS, Python, JSON, HTML, CSS, SQL, YAML, shell/bash, markdown, plus a custom `LanguageDescription` for Elixir via `codemirror-lang-elixir`). Vite splits each into its own lazy-loaded chunk. Custom `HighlightStyle` (`src/lib/editor/highlight.ts` — Tokyo Night-ish dark + Catppuccin Latte-ish light) replaces oneDark's built-in token colours for higher contrast.

### Phase 8 — Cross-platform readiness + CI/CD release pipeline

- [ ] **Portability fixes + GitHub Actions release workflow** (`cross-platform-build-cicd` task). Tracks the small mac-only assumptions to fix (Cmd+, accelerator, mac-only menu items behind `#[cfg(target_os = "macos")]`, Windows shell fallback in `pty.rs`, board/column name validation for Windows reserved chars, `⌘`/`⇧` glyphs in the palette). Plus a minimum-viable matrix workflow that builds DMG / MSI / EXE / DEB / AppImage on tag push and uploads to a draft Release. Code signing and notarization deliberately deferred to v2 — ship unsigned and document Gatekeeper / SmartScreen workarounds in the README.

### Phase 9 — Style improvements + bug fixes

Smaller items tracked in their own to-do tasks rather than expanded inline here:
- [ ] **`style-improvements` task** — saved/unsaved tag in editor, close-button cross icon + maximize, capitalize Silex in macOS menu, sidebar Silex header → home link, refresh shortcut hints on home page, resizable task detail panel with persisted width, copy-path button on tasks/notes.
- [ ] **`fix-rename-bug-in-notes-directories` task** — when renaming a directory in the notes section, the new directory gets created but the old one persists. Likely a watcher rename-pair detection issue (old path treated as removed but the rename completes after; could also be a cross-OS atomicity issue).

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
