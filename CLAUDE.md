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
- [ ] **3. Vault selection** — first-launch modal, native folder picker via Tauri dialog plugin, persist via Tauri store plugin
- [ ] **4. Rust commands** — `read_vault` (frontmatter only), `read_task_body`, `write_task` (atomic, returns hash), `move_task`, `delete_task`
- [ ] **5. Svelte stores** — `vaultStore`, `boardsStore`, `tasksStore`, `uiStore` (full), `writeHashStore`
- [ ] **6. Sync loop + integration tests** — `watch_vault` Rust + hash-dedup + reconciliation. Don't progress until bulletproof.
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

**Step 2 complete.** Ready for step 3.

**What's wired up so far:**
- Project scaffold builds and type-checks cleanly
- App shell: sidebar (`w-60`, dark) with placeholder "Boards" section, main content area, bottom terminal panel
- Terminal panel hidden by default, `⌘ J` toggles it (Ctrl on non-Mac), close button in panel header. (Originally specced as `Cmd+\``, swapped to `Cmd+J` because backtick is awkward on non-US keyboards.)
- Minimal `uiStore` at `src/lib/stores/ui.svelte.ts` with just `terminalOpen` (full store comes in step 5)
- Default home page is a centered placeholder explaining the keyboard shortcut

**Files of note (current state):**
- `src/routes/+layout.svelte` — app shell + global keydown listener
- `src/routes/+page.svelte` — home placeholder
- `src/routes/+layout.ts` — `ssr = false`
- `src/lib/stores/ui.svelte.ts` — UI store
- `src/app.css` — `@import "tailwindcss";`
- `vite.config.js` — `tailwindcss()` plugin registered
- `src-tauri/` — default Tauri 2 scaffold (still has the demo `greet` command; will clean up around step 4)

**Known leftover scaffolding to clean up later:**
- `static/vite.svg`, `static/tauri.svg`, `static/svelte.svg` — demo assets, unreferenced
- `src-tauri/src/lib.rs` `greet` command — demo, unused

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
