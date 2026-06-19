//! Vault-wide reads: enumerating entries, reading a single entry, and reading
//! markdown bodies. `parse_entry`/`count_subtasks` back the first three.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use gray_matter::engine::YAML;
use gray_matter::Matter;
use walkdir::WalkDir;

use crate::error::{Error, Result};
use crate::models::VaultEntry;

#[tauri::command]
pub async fn read_vault(path: String) -> Result<Vec<VaultEntry>> {
    let vault = PathBuf::from(&path);
    if !vault.is_dir() {
        return Err(Error::NotFound(format!(
            "Vault path is not a directory: {}",
            path
        )));
    }

    let templates_dir = vault.join("templates");
    let boards_dir = vault.join("boards");
    let mut entries = Vec::new();

    for entry in WalkDir::new(&vault)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let p = entry.path();
        if p.extension().and_then(|s| s.to_str()) != Some("md") {
            continue;
        }
        if p.starts_with(&templates_dir) {
            continue;
        }

        if let Some(parsed) = parse_entry(p, &boards_dir) {
            entries.push(parsed);
        }
    }

    Ok(entries)
}

#[tauri::command]
pub async fn read_entry(vault_path: String, path: String) -> Result<Option<VaultEntry>> {
    let boards_dir = PathBuf::from(&vault_path).join("boards");
    Ok(parse_entry(Path::new(&path), &boards_dir))
}

#[tauri::command]
pub async fn read_task_body(path: String) -> Result<String> {
    let content = fs::read_to_string(&path)?;
    let parsed = Matter::<YAML>::new().parse(&content);
    Ok(parsed.content)
}

#[tauri::command]
pub async fn read_bodies(vault_path: String) -> Result<HashMap<String, String>> {
    let vault = PathBuf::from(&vault_path);
    if !vault.is_dir() {
        return Err(Error::NotFound(format!(
            "Vault path is not a directory: {}",
            vault_path
        )));
    }
    let templates_dir = vault.join("templates");
    let mut out = HashMap::new();
    for entry in WalkDir::new(&vault)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let p = entry.path();
        if p.extension().and_then(|s| s.to_str()) != Some("md") {
            continue;
        }
        if p.starts_with(&templates_dir) {
            continue;
        }
        let content = match fs::read_to_string(p) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let parsed = Matter::<YAML>::new().parse(&content);
        out.insert(p.to_string_lossy().into_owned(), parsed.content);
    }
    Ok(out)
}

/// Classify a `.md` file by its path relative to the vault and read its
/// frontmatter + subtask counts. Path is canonical: a file exactly three
/// segments under `boards/` is a task; under `reminders/` a reminder;
/// anything else a note.
fn parse_entry(p: &Path, boards_dir: &Path) -> Option<VaultEntry> {
    if p.extension().and_then(|s| s.to_str()) != Some("md") {
        return None;
    }

    let vault = boards_dir.parent()?;
    let reminders_dir = vault.join("reminders");

    let (kind, board, column) = if p.starts_with(boards_dir) {
        let rel = p.strip_prefix(boards_dir).ok()?;
        let parts: Vec<_> = rel.iter().collect();
        if parts.len() == 3 {
            let board = parts[0].to_string_lossy().into_owned();
            let column = parts[1].to_string_lossy().into_owned();
            ("task".to_string(), Some(board), Some(column))
        } else {
            return None;
        }
    } else if p.starts_with(&reminders_dir) {
        ("reminder".to_string(), None, None)
    } else {
        ("note".to_string(), None, None)
    };

    let content = fs::read_to_string(p).ok()?;
    let parsed = Matter::<YAML>::new().parse(&content);
    let frontmatter = parsed
        .data
        .and_then(|pod| pod.deserialize::<serde_json::Value>().ok())
        .unwrap_or(serde_json::Value::Null);
    let (subtask_total, subtask_done) = count_subtasks(&parsed.content);

    Some(VaultEntry {
        path: p.to_string_lossy().into_owned(),
        kind,
        board,
        column,
        frontmatter,
        subtask_total,
        subtask_done,
    })
}

/// Count GFM task-list items (`- [ ]` / `- [x]`, `*` variants) in a body,
/// returning `(total, done)`.
fn count_subtasks(body: &str) -> (usize, usize) {
    let mut total = 0usize;
    let mut done = 0usize;
    for line in body.lines() {
        let t = line.trim_start();
        if t.starts_with("- [ ]") || t.starts_with("* [ ]") {
            total += 1;
        } else if t.starts_with("- [x]")
            || t.starts_with("- [X]")
            || t.starts_with("* [x]")
            || t.starts_with("* [X]")
        {
            total += 1;
            done += 1;
        }
    }
    (total, done)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn count_subtasks_handles_mixed_list_styles_and_indentation() {
        let body = r#"
## Tasks

- [ ] Open
- [x] Done
- [X] Also done
  - [ ] Nested open
* [ ] Asterisk open
* [x] Asterisk done
- [] Not a checkbox
- Plain bullet
"#;
        let (total, done) = count_subtasks(body);
        assert_eq!(total, 6);
        assert_eq!(done, 3);
    }

    #[test]
    fn parse_entry_classifies_task_at_correct_depth() {
        use std::io::Write as _;
        let dir = tempfile::tempdir().unwrap();
        let boards = dir.path().join("boards");
        let task_dir = boards.join("my-board").join("backlog");
        fs::create_dir_all(&task_dir).unwrap();
        let task_file = task_dir.join("task.md");
        let mut f = fs::File::create(&task_file).unwrap();
        f.write_all(b"---\ntitle: Test\n---\nbody\n").unwrap();

        let entry = parse_entry(&task_file, &boards).unwrap();
        assert_eq!(entry.kind, "task");
        assert_eq!(entry.board.as_deref(), Some("my-board"));
        assert_eq!(entry.column.as_deref(), Some("backlog"));
    }

    #[test]
    fn parse_entry_classifies_note_outside_boards() {
        use std::io::Write as _;
        let dir = tempfile::tempdir().unwrap();
        let boards = dir.path().join("boards");
        let note_file = dir.path().join("daily.md");
        let mut f = fs::File::create(&note_file).unwrap();
        f.write_all(b"plain note\n").unwrap();

        let entry = parse_entry(&note_file, &boards).unwrap();
        assert_eq!(entry.kind, "note");
        assert!(entry.board.is_none());
        assert!(entry.column.is_none());
    }

    #[test]
    fn parse_entry_classifies_reminder_under_reminders_dir() {
        use std::io::Write as _;
        let dir = tempfile::tempdir().unwrap();
        let boards = dir.path().join("boards");
        let reminders = dir.path().join("reminders");
        fs::create_dir_all(&reminders).unwrap();
        let r_file = reminders.join("call-dentist.md");
        let mut f = fs::File::create(&r_file).unwrap();
        f.write_all(b"---\ntitle: Call dentist\nreminder: 2026-05-10T14:30\n---\n")
            .unwrap();

        let entry = parse_entry(&r_file, &boards).unwrap();
        assert_eq!(entry.kind, "reminder");
        assert!(entry.board.is_none());
        assert!(entry.column.is_none());
    }
}
