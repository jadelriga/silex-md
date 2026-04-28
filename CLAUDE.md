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
- [ ] **7. Kanban board** — svelte-dnd-action, file moves on drop, fractional-indexing for order
- [ ] **8. Task detail panel** — lazy body load, CodeMirror 6 editor, debounced autosave (300ms), dirty-state tracking, conflict banner
- [ ] **9. Notes** — sidebar tree + full-area editor, same sync loop. Wikilinks/backlinks deferred to post-v1.
- [ ] **10. Calendar view** — read-only over local due dates, behind `CalendarAdapter` interface
- [ ] **11. Notifications** — Tauri plugin + 15-minute interval, configurable lead time
- [ ] **12. Embedded terminal** — portable-pty + xterm.js (real PTY required, not piped stdio)
- [ ] **13. Command palette** — `Cmd+P`, custom Svelte component
- [ ] **14. Search overlay** — `Cmd+K`, in-memory, frontmatter + title only in v1
- [ ] **15. Theming + keyboard shortcuts** — incremental throughout; CSS variables for theme swap

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

## Current status

**Step 6 complete.** Ready for step 7.

**What's wired up so far:**
- Project scaffold builds and type-checks cleanly
- App shell: sidebar (`w-60`, dark) with "Silex" header (shows vault basename when loaded), main content area, bottom terminal panel
- Terminal panel hidden by default, `⌘ J` toggles it (Ctrl on non-Mac), close button in panel header. (Originally specced as `Cmd+\``, swapped to `Cmd+J` because backtick is awkward on non-US keyboards.)
- Full `uiStore` at `src/lib/stores/ui.svelte.ts` with `terminalOpen`, `activeBoard`, `openTaskPath`, `paletteOpen`, `searchOpen`
- Tauri plugins: `tauri-plugin-dialog`, `tauri-plugin-store`, `tauri-plugin-opener` (unused, scaffold default)
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
- `static/vite.svg`, `static/tauri.svg`, `static/svelte.svg` — demo assets, unreferenced
- `tauri-plugin-opener` — scaffold default, currently unused; can be removed (Cargo.toml + lib.rs + capabilities)
- macOS title bar still shows light system bar over dark UI — apply `titleBarStyle: "Overlay"` in `tauri.conf.json` later as polish

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
