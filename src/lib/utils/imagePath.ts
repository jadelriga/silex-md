/**
 * Resolution of markdown image URLs to either a remote src (usable directly in
 * an <img>) or an absolute filesystem path inside/relative to the vault.
 *
 * Pure string ops — no Tauri imports — so the whole module is unit-testable.
 * `convertFileSrc` is applied at the call site (livePreview.ts), keeping this
 * the single place that understands markdown image path semantics:
 *
 *  - http(s):// and data: pass through untouched.
 *  - file://<abs> is treated as an absolute local path.
 *  - a leading "/" is vault-rooted (joined onto the vault root), so links like
 *    `![](/attachments/x.png)` survive moving the note anywhere in the vault.
 *  - anything else is relative to the note's directory.
 *
 * Markdown URLs are percent-encoded (`![](my%20img.png)` → file `my img.png`),
 * so the path portion is decoded before any path math. Paths that escape the
 * vault via `..` resolve literally — the asset-protocol scope (vault-only) is
 * the security boundary, so such images simply fail to load.
 */

export type ResolvedImage = { kind: "remote"; src: string } | { kind: "local"; fsPath: string };

export function resolveImageSrc(src: string, noteDir: string, vaultRoot: string): ResolvedImage {
  if (/^https?:\/\//i.test(src) || /^data:/i.test(src)) {
    return { kind: "remote", src };
  }

  // Obsidian-style suffixes (`![](img.png#small)`) and stray queries are not
  // part of the filename.
  const decoded = safeDecode(src.replace(/[#?].*$/, ""));

  if (/^file:\/\//i.test(decoded)) {
    return { kind: "local", fsPath: normalizePath(decoded.slice("file://".length)) };
  }
  if (/^[\\/]/.test(decoded)) {
    return { kind: "local", fsPath: joinPath(vaultRoot, decoded) };
  }
  return { kind: "local", fsPath: joinPath(noteDir, decoded) };
}

/** Directory containing `path`, using the same separator handling as the rest
 * of this module. Returns "" when there is no parent segment. */
export function dirnameOf(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  const idx = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (idx < 0) return "";
  if (idx === 0) return trimmed.slice(0, 1); // posix root "/"
  return trimmed.slice(0, idx);
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s; // malformed % sequence — use the raw string
  }
}

function joinPath(base: string, rel: string): string {
  return normalizePath(`${base}/${rel}`);
}

/** Collapses `.`/`..` segments and re-joins with the separator detected from
 * the path itself. Any `\` marks a Windows path (paths from Rust on Windows
 * are `\`-separated; markdown links and posix paths only use `/`). Preserves
 * a posix leading `/` and Windows drive prefixes (`C:`). */
function normalizePath(path: string): string {
  const sep = path.includes("\\") ? "\\" : "/";
  const isPosixAbsolute = /^[\\/]/.test(path);
  const segments: string[] = [];
  for (const segment of path.split(/[\\/]+/)) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      const last = segments[segments.length - 1];
      // Don't pop past the root or a drive prefix; keep ".." if nothing to pop.
      if (segments.length > 0 && last !== ".." && !/^[A-Za-z]:$/.test(last)) {
        segments.pop();
      } else if (!isPosixAbsolute && !/^[A-Za-z]:$/.test(last ?? "")) {
        segments.push("..");
      }
      continue;
    }
    segments.push(segment);
  }
  return (isPosixAbsolute ? sep : "") + segments.join(sep);
}
