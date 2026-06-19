//! Notes and note folders: creation plus enumerating folders for the sidebar
//! tree. `validate_note_relative` enforces the path rules (relative, no
//! traversal, not under `boards/`).

use std::fs;
use std::path::{Path, PathBuf};

use walkdir::WalkDir;

use crate::error::{Error, Result};
use crate::util::is_invalid_segment;

#[tauri::command]
pub async fn list_note_folders(vault_path: String) -> Result<Vec<String>> {
    let vault = PathBuf::from(&vault_path);
    if !vault.is_dir() {
        return Err(Error::NotFound(format!(
            "Vault path is not a directory: {}",
            vault_path
        )));
    }
    do_list_note_folders(&vault)
}

fn do_list_note_folders(vault: &Path) -> Result<Vec<String>> {
    let boards_dir = vault.join("boards");
    let templates_dir = vault.join("templates");
    let reminders_dir = vault.join("reminders");
    let attachments_dir = vault.join("attachments");
    let mut out: Vec<String> = Vec::new();

    for entry in WalkDir::new(vault)
        .follow_links(false)
        .min_depth(1)
        .into_iter()
        .filter_entry(|e| {
            let p = e.path();
            !p.starts_with(&boards_dir)
                && !p.starts_with(&templates_dir)
                && !p.starts_with(&reminders_dir)
                && !p.starts_with(&attachments_dir)
        })
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_dir() {
            continue;
        }
        let p = entry.path();
        if let Ok(rel) = p.strip_prefix(vault) {
            out.push(rel.to_string_lossy().into_owned());
        }
    }
    out.sort();
    Ok(out)
}

#[tauri::command]
pub async fn create_note_folder(vault_path: String, relative_path: String) -> Result<String> {
    do_create_note_folder(Path::new(&vault_path), &relative_path)
        .map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn create_note(vault_path: String, relative_path: String) -> Result<String> {
    do_create_note(Path::new(&vault_path), &relative_path).map(|p| p.to_string_lossy().into_owned())
}

fn do_create_note_folder(vault: &Path, relative_path: &str) -> Result<PathBuf> {
    let segments = validate_note_relative(relative_path)?;
    if segments.is_empty() {
        return Err(Error::Invalid("Folder path cannot be empty".to_string()));
    }
    let mut folder_path = vault.to_path_buf();
    for seg in &segments {
        folder_path.push(seg);
    }
    if folder_path.exists() {
        return Err(Error::Conflict(format!(
            "Folder already exists: {}",
            relative_path
        )));
    }
    fs::create_dir_all(&folder_path)?;
    Ok(folder_path)
}

fn do_create_note(vault: &Path, relative_path: &str) -> Result<PathBuf> {
    let segments = validate_note_relative(relative_path)?;
    if segments.is_empty() {
        return Err(Error::Invalid("Note path cannot be empty".to_string()));
    }
    let mut path = vault.to_path_buf();
    for seg in &segments {
        path.push(seg);
    }
    if path.extension().and_then(|e| e.to_str()) != Some("md") {
        let mut new_name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default();
        new_name.push_str(".md");
        path.set_file_name(new_name);
    }
    if path.exists() {
        return Err(Error::Conflict(format!(
            "Note already exists: {}",
            path.display()
        )));
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&path, "")?;
    Ok(path)
}

fn validate_note_relative(relative_path: &str) -> Result<Vec<String>> {
    let trimmed = relative_path.trim();
    if trimmed.is_empty() {
        return Err(Error::Invalid("Path cannot be empty".to_string()));
    }
    if trimmed.starts_with('/') {
        return Err(Error::Invalid(
            "Path must be relative (no leading '/')".to_string(),
        ));
    }
    let segments: Vec<String> = trimmed
        .split('/')
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect();
    for seg in &segments {
        if seg == ".." || seg == "." {
            return Err(Error::Invalid(
                "Path cannot contain '.' or '..' segments".to_string(),
            ));
        }
        if is_invalid_segment(seg) {
            return Err(Error::Invalid(format!("Invalid path segment: '{}'", seg)));
        }
    }
    if segments.first().map(|s| s.as_str()) == Some("boards") {
        return Err(Error::Invalid(
            "Notes cannot live under '/boards'".to_string(),
        ));
    }
    Ok(segments)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_note_folder_creates_nested_dirs() {
        let dir = tempfile::tempdir().unwrap();
        let result = do_create_note_folder(dir.path(), "journal/2026").unwrap();
        assert_eq!(result, dir.path().join("journal").join("2026"));
        assert!(dir.path().join("journal").join("2026").is_dir());
    }

    #[test]
    fn create_note_folder_rejects_paths_with_dotdot() {
        let dir = tempfile::tempdir().unwrap();
        assert!(do_create_note_folder(dir.path(), "../escape").is_err());
        assert!(do_create_note_folder(dir.path(), "foo/../bar").is_err());
    }

    #[test]
    fn create_note_folder_rejects_paths_under_boards() {
        let dir = tempfile::tempdir().unwrap();
        assert!(do_create_note_folder(dir.path(), "boards/x").is_err());
    }

    #[test]
    fn create_note_appends_md_extension_when_missing() {
        let dir = tempfile::tempdir().unwrap();
        let result = do_create_note(dir.path(), "scratch").unwrap();
        assert_eq!(result, dir.path().join("scratch.md"));
        assert!(dir.path().join("scratch.md").is_file());
    }

    #[test]
    fn create_note_keeps_md_extension_when_present() {
        let dir = tempfile::tempdir().unwrap();
        let result = do_create_note(dir.path(), "ideas.md").unwrap();
        assert_eq!(result, dir.path().join("ideas.md"));
    }

    #[test]
    fn create_note_replaces_other_extensions_with_md() {
        let dir = tempfile::tempdir().unwrap();
        let result = do_create_note(dir.path(), "thing.txt").unwrap();
        assert_eq!(result, dir.path().join("thing.txt.md"));
    }

    #[test]
    fn create_note_creates_intermediate_dirs() {
        let dir = tempfile::tempdir().unwrap();
        do_create_note(dir.path(), "journal/april/29").unwrap();
        assert!(dir
            .path()
            .join("journal")
            .join("april")
            .join("29.md")
            .is_file());
    }

    #[test]
    fn create_note_rejects_duplicates() {
        let dir = tempfile::tempdir().unwrap();
        do_create_note(dir.path(), "a").unwrap();
        let err = do_create_note(dir.path(), "a").unwrap_err();
        assert!(err.to_string().contains("already exists"));
    }

    #[test]
    fn create_note_rejects_paths_under_boards() {
        let dir = tempfile::tempdir().unwrap();
        assert!(do_create_note(dir.path(), "boards/foo").is_err());
    }

    #[test]
    fn list_note_folders_excludes_attachments() {
        let dir = tempfile::tempdir().unwrap();
        for folder in ["attachments", "journal", "templates", "boards", "reminders"] {
            fs::create_dir_all(dir.path().join(folder)).unwrap();
        }
        let folders = do_list_note_folders(dir.path()).unwrap();
        assert_eq!(folders, vec!["journal".to_string()]);
    }
}
