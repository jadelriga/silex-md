# Silex

Lightweight desktop kanban + notes app where Markdown files are the database. Cross-platform via Tauri 2; primary target is macOS. Designed to be scriptable by Claude Code through an embedded terminal that has full access to your vault.

> **Status:** pre-1.0. Single-developer project, ships unsigned. See *[Install](#install)* below for the Gatekeeper / SmartScreen workarounds.

## What's it for

- Boards / columns / cards backed by `.md` files under `/boards/<board>/<column>/<card>.md`.
- Notes anywhere else under the vault, with a sidebar tree.
- Calendar view over time-based reminders.
- Embedded terminal so Claude Code (or vim / lazygit / anything TUI) can edit your vault while the app is open.
- Live-preview Markdown editor (Obsidian-style decorations on raw bytes — saves are byte-perfect).
- Full-text search with filter chips.
- Native macOS menu bar with the usual shortcuts.

The app reads + writes plain Markdown. There is no proprietary database. Move the vault directory anywhere; open it with any editor; sync it with anything you like.

## Install

Builds are produced by GitHub Actions on every `v*` tag and uploaded to a draft Release. Grab the asset for your platform from `https://github.com/<owner>/<repo>/releases` (replace `<owner>/<repo>` with the eventual repo path).

### macOS

Download the `.dmg` for your architecture (Apple Silicon → `aarch64`, Intel → `x86_64`), open it, drag Silex to Applications.

The build is **unsigned**, so on first launch macOS will refuse to open it ("Silex is damaged and can't be opened"). Two ways to clear the quarantine flag:

```bash
# After dragging Silex into /Applications
xattr -d com.apple.quarantine /Applications/Silex.app
```

Or right-click → Open → Open in the dialog (works once, then macOS remembers).

### Windows

Download the `.msi` (recommended) or the `.exe` (NSIS installer). On first launch SmartScreen will warn ("Windows protected your PC"). Click *More info* → *Run anyway*.

WebView2 is required and ships with Windows 11 / current Windows 10. If you're on a stripped-down Windows install, get it from https://developer.microsoft.com/microsoft-edge/webview2/.

### Linux

Choose the `.AppImage` for the most portable experience, or the `.deb` for Debian/Ubuntu-derived distros. AppImage:

```bash
chmod +x Silex_*.AppImage
./Silex_*.AppImage
```

Minimum baseline: **Ubuntu 22.04 / Debian 12 or newer** — Tauri 2 needs `webkit2gtk-4.1`, which is the package version shipped from those releases onward.

#### Caveats on Linux

- **inotify watch limit.** The app watches your vault recursively. On very large vaults (thousands of files) you may exceed the per-user inotify watch limit and silently lose change-detection. Bump it with `echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf && sudo sysctl -p`.
- **Filesystem case-sensitivity.** Linux filesystems are case-sensitive by default; macOS and Windows are case-insensitive. Moving a vault between OSes that has e.g. `Backlog` and `backlog` columns will merge or split state in surprising ways.

## Build from source

You'll need:
- Node 20+
- Rust stable (`rustup install stable`)
- Tauri's per-OS prerequisites: https://tauri.app/start/prerequisites/

Clone, then:

```bash
npm install
npm run tauri dev   # development build, opens the app
npm run tauri build # production bundle, in src-tauri/target/release/bundle/
```

For the test suites:

```bash
npm run check       # svelte-check
npm test            # vitest (Svelte/TS)
cd src-tauri && cargo test
```

## License

MIT — see `LICENSE`.
