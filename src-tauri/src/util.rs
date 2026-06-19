use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};
use tempfile::NamedTempFile;

use crate::error::{Error, Result};

/// Returns true if `name` is unsafe to use as a single path segment on any
/// of our target OSes (macOS, Linux, Windows). Specifically rejects empty
/// strings, anything containing `/` or `\` or `..`, names that end in `.`
/// or space (Windows silently strips those, corrupting the resulting path),
/// and the Windows reserved device names (`CON`, `PRN`, `AUX`, `NUL`,
/// `COM1`–`COM9`, `LPT1`–`LPT9`).
pub(crate) fn is_invalid_segment(name: &str) -> bool {
    if name.is_empty() {
        return true;
    }
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return true;
    }
    if name.ends_with(' ') || name.ends_with('.') {
        return true;
    }
    let upper = name.to_ascii_uppercase();
    let stem = upper.split('.').next().unwrap_or(&upper);
    matches!(
        stem,
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    )
}

/// Lowercase, split on non-alphanumerics, join with `-`. Used to derive file
/// slugs from titles.
pub(crate) fn slugify(s: &str) -> String {
    let lower = s.to_lowercase();
    let parts: Vec<String> = lower
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect();
    parts.join("-")
}

/// Double-quote and escape a string for a single-line YAML scalar.
pub(crate) fn yaml_dq(s: &str) -> String {
    let escaped = s
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace(['\n', '\r'], " ");
    format!("\"{}\"", escaped)
}

/// Milliseconds since the Unix epoch (0 if the clock is before it).
pub(crate) fn now_millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

/// SHA-256 of `content`, lowercase hex. Same algorithm the sync loop uses on
/// the TS side so the two hashes are comparable for write/watcher dedup.
pub(crate) fn hash_bytes(content: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content);
    format!("{:x}", hasher.finalize())
}

/// Returns a non-colliding path inside `dir` for `name`, appending `-N`
/// before the extension if needed (`a.png` -> `a-1.png` -> `a-2.png`).
pub(crate) fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let (stem, ext) = match name.rsplit_once('.') {
        Some((s, e)) => (s, format!(".{}", e)),
        None => (name, String::new()),
    };
    let mut n = 1u32;
    loop {
        let candidate = dir.join(format!("{}-{}{}", stem, n, ext));
        if !candidate.exists() {
            return candidate;
        }
        n += 1;
    }
}

/// Atomically write `bytes` to `path`: write to a temp file in the same
/// directory, then rename over the target (so a crash mid-write never leaves a
/// half-written file). Creates the parent directory if missing.
pub(crate) fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| Error::Invalid(format!("No parent directory for {}", path.display())))?;
    fs::create_dir_all(parent)?;
    let mut tmp = NamedTempFile::new_in(parent)?;
    tmp.write_all(bytes)?;
    tmp.flush()?;
    tmp.persist(path).map_err(|e| Error::Io(e.error))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn slugify_handles_simple_titles() {
        assert_eq!(slugify("Call dentist"), "call-dentist");
        assert_eq!(slugify("Hello, World!"), "hello-world");
        assert_eq!(slugify("foo  bar   baz"), "foo-bar-baz");
    }

    #[test]
    fn slugify_handles_empty_or_only_special() {
        assert_eq!(slugify(""), "");
        assert_eq!(slugify("!!!"), "");
        assert_eq!(slugify("   "), "");
    }

    #[test]
    fn yaml_dq_escapes_backslashes_and_quotes() {
        assert_eq!(yaml_dq("plain"), "\"plain\"");
        assert_eq!(yaml_dq("with \"quotes\""), "\"with \\\"quotes\\\"\"");
        assert_eq!(yaml_dq("a\\b"), "\"a\\\\b\"");
        assert_eq!(yaml_dq("multi\nline"), "\"multi line\"");
    }

    #[test]
    fn hash_bytes_is_deterministic_and_hex_encoded() {
        let h1 = hash_bytes(b"hello");
        let h2 = hash_bytes(b"hello");
        assert_eq!(h1, h2);
        assert_eq!(h1.len(), 64);
        assert!(h1.chars().all(|c| c.is_ascii_hexdigit()));
    }
}
