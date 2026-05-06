/**
 * Platform helpers for the frontend. Used to render OS-appropriate keyboard
 * shortcut hints — `⌘ ⇧ P` on macOS vs `Ctrl+Shift+P` on Windows/Linux.
 *
 * Detection is deliberately simple (`navigator.platform` regex) rather than
 * reaching for `@tauri-apps/plugin-os`; the latter would force every label
 * site to be async-aware. `navigator.platform` is enough for shortcut hints.
 */

export const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform);

export interface ShortcutParts {
  mod?: boolean;   // Cmd on macOS, Ctrl elsewhere
  shift?: boolean;
  alt?: boolean;   // Option on macOS
  key: string;
}

export function fmtShortcut(p: ShortcutParts): string {
  const out: string[] = [];
  if (isMac) {
    if (p.mod) out.push("⌘");
    if (p.shift) out.push("⇧");
    if (p.alt) out.push("⌥");
    out.push(p.key);
    return out.join(" ");
  }
  if (p.mod) out.push("Ctrl");
  if (p.shift) out.push("Shift");
  if (p.alt) out.push("Alt");
  out.push(p.key);
  return out.join("+");
}
