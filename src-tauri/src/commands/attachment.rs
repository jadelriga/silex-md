//! Saving pasted-image attachments into `<vault>/attachments/`.

use std::fs;
use std::path::Path;

use crate::error::{Error, Result};
use crate::util::{is_invalid_segment, now_millis, unique_path, write_atomic};

/// Saves a pasted image into `<vault>/attachments/` and returns the
/// vault-rooted markdown path (`/attachments/<name>`). The image bytes arrive
/// as the raw IPC body (avoids JSON-encoding megabytes); the vault path and
/// suggested filename come in `x-vault` / `x-filename` headers. Header values
/// must be ASCII, so the JS side percent-encodes the vault path (the filename
/// is app-generated ASCII). Sync command: `Request` is a borrowed type, which
/// async commands don't support.
#[tauri::command]
pub fn save_attachment(request: tauri::ipc::Request<'_>) -> Result<String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(Error::Other(
            "save_attachment expects a raw binary body".to_string(),
        ));
    };
    let header = |name: &str| {
        request
            .headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(|v| v.to_string())
    };
    let vault_encoded =
        header("x-vault").ok_or_else(|| Error::Other("missing x-vault header".to_string()))?;
    let vault = percent_encoding::percent_decode_str(&vault_encoded)
        .decode_utf8()
        .map_err(|e| Error::Other(e.to_string()))?
        .into_owned();
    let name = header("x-filename").unwrap_or_default();
    do_save_attachment(Path::new(&vault), &name, bytes)
}

fn do_save_attachment(vault: &Path, name: &str, bytes: &[u8]) -> Result<String> {
    if bytes.is_empty() {
        return Err(Error::Invalid(
            "Refusing to save an empty attachment".to_string(),
        ));
    }
    // Fall back to a generated name rather than erroring: the name is
    // app-generated convenience metadata, not user input worth rejecting over.
    let safe_name = if is_invalid_segment(name) {
        format!("pasted-{}.png", now_millis())
    } else {
        name.to_string()
    };

    let attachments = vault.join("attachments");
    fs::create_dir_all(&attachments)?;
    let final_path = unique_path(&attachments, &safe_name);

    write_atomic(&final_path, bytes)?;

    let file_name = final_path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .ok_or_else(|| Error::Other("attachment path has no file name".to_string()))?;
    Ok(format!("/attachments/{}", file_name))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn save_attachment_writes_file_and_returns_vault_rooted_path() {
        let dir = tempfile::tempdir().unwrap();
        let result = do_save_attachment(dir.path(), "pasted-1.png", b"\x89PNG fake").unwrap();
        assert_eq!(result, "/attachments/pasted-1.png");
        let written = dir.path().join("attachments").join("pasted-1.png");
        assert_eq!(fs::read(&written).unwrap(), b"\x89PNG fake");
    }

    #[test]
    fn save_attachment_resolves_collisions_with_suffix() {
        let dir = tempfile::tempdir().unwrap();
        let r1 = do_save_attachment(dir.path(), "pasted-1.png", b"a").unwrap();
        let r2 = do_save_attachment(dir.path(), "pasted-1.png", b"b").unwrap();
        assert_eq!(r1, "/attachments/pasted-1.png");
        assert_eq!(r2, "/attachments/pasted-1-1.png");
        let attachments = dir.path().join("attachments");
        assert_eq!(fs::read(attachments.join("pasted-1.png")).unwrap(), b"a");
        assert_eq!(fs::read(attachments.join("pasted-1-1.png")).unwrap(), b"b");
    }

    #[test]
    fn save_attachment_regenerates_unsafe_filenames_inside_attachments() {
        let dir = tempfile::tempdir().unwrap();
        let result = do_save_attachment(dir.path(), "../evil.png", b"x").unwrap();
        assert!(result.starts_with("/attachments/pasted-"));
        assert!(!dir.path().join("evil.png").exists());
        // Exactly one file, and it lives inside attachments/.
        let entries: Vec<_> = fs::read_dir(dir.path().join("attachments"))
            .unwrap()
            .filter_map(|e| e.ok())
            .collect();
        assert_eq!(entries.len(), 1);
    }

    #[test]
    fn save_attachment_rejects_empty_bytes() {
        let dir = tempfile::tempdir().unwrap();
        assert!(do_save_attachment(dir.path(), "pasted-1.png", b"").is_err());
        assert!(!dir.path().join("attachments").exists());
    }
}
