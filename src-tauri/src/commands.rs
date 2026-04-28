use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use gray_matter::engine::YAML;
use gray_matter::Matter;
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, State};
use tempfile::NamedTempFile;
use walkdir::WalkDir;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VaultEntry {
    pub path: String,
    pub kind: String,
    pub board: Option<String>,
    pub column: Option<String>,
    pub frontmatter: serde_json::Value,
    pub subtask_total: usize,
    pub subtask_done: usize,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct BoardLayout {
    pub name: String,
    pub columns: Vec<String>,
}

pub struct WatcherState {
    pub watcher: Mutex<Option<RecommendedWatcher>>,
}

impl WatcherState {
    pub fn new() -> Self {
        Self {
            watcher: Mutex::new(None),
        }
    }
}

#[tauri::command]
pub async fn read_vault(path: String) -> Result<Vec<VaultEntry>, String> {
    let vault = PathBuf::from(&path);
    if !vault.is_dir() {
        return Err(format!("Vault path is not a directory: {}", path));
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
pub async fn read_entry(vault_path: String, path: String) -> Result<Option<VaultEntry>, String> {
    let boards_dir = PathBuf::from(&vault_path).join("boards");
    Ok(parse_entry(Path::new(&path), &boards_dir))
}

#[tauri::command]
pub async fn list_boards(vault_path: String) -> Result<Vec<BoardLayout>, String> {
    let boards_dir = PathBuf::from(&vault_path).join("boards");
    if !boards_dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut layouts = Vec::new();
    let board_dirs = match fs::read_dir(&boards_dir) {
        Ok(it) => it,
        Err(e) => return Err(e.to_string()),
    };

    for board_entry in board_dirs.flatten() {
        if !board_entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let board_name = board_entry.file_name().to_string_lossy().into_owned();
        let mut columns = Vec::new();
        if let Ok(col_dirs) = fs::read_dir(board_entry.path()) {
            for col_entry in col_dirs.flatten() {
                if col_entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    columns.push(col_entry.file_name().to_string_lossy().into_owned());
                }
            }
        }
        columns.sort();
        layouts.push(BoardLayout {
            name: board_name,
            columns,
        });
    }
    layouts.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(layouts)
}

#[tauri::command]
pub async fn read_task_body(path: String) -> Result<String, String> {
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let parsed = Matter::<YAML>::new().parse(&content);
    Ok(parsed.content)
}

#[tauri::command]
pub async fn write_task(path: String, content: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    let parent = p
        .parent()
        .ok_or_else(|| format!("No parent directory for {}", path))?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;

    let mut tmp = NamedTempFile::new_in(parent).map_err(|e| e.to_string())?;
    tmp.write_all(content.as_bytes())
        .map_err(|e| e.to_string())?;
    tmp.flush().map_err(|e| e.to_string())?;
    tmp.persist(&p).map_err(|e| e.to_string())?;

    Ok(hash_bytes(content.as_bytes()))
}

#[tauri::command]
pub async fn move_task(from: String, to: String) -> Result<(), String> {
    let from_p = PathBuf::from(&from);
    let to_p = PathBuf::from(&to);

    if let Some(parent) = to_p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    if fs::rename(&from_p, &to_p).is_ok() {
        return Ok(());
    }

    fs::copy(&from_p, &to_p).map_err(|e| e.to_string())?;
    fs::remove_file(&from_p).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_task(path: String) -> Result<(), String> {
    fs::remove_file(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn watch_vault(
    app: AppHandle,
    state: State<'_, WatcherState>,
    path: String,
) -> Result<(), String> {
    let mut guard = state.watcher.lock().map_err(|e| e.to_string())?;
    *guard = None;

    let app_for_cb = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        match res {
            Ok(event) => emit_change(&app_for_cb, event),
            Err(e) => eprintln!("Watcher error: {:?}", e),
        }
    })
    .map_err(|e| e.to_string())?;

    watcher
        .watch(Path::new(&path), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    *guard = Some(watcher);
    Ok(())
}

fn emit_change(app: &AppHandle, event: notify::Event) {
    let kind = match event.kind {
        EventKind::Create(_) => "created",
        EventKind::Modify(_) => "modified",
        EventKind::Remove(_) => "removed",
        _ => return,
    };

    for path in event.paths {
        if path.extension().and_then(|s| s.to_str()) != Some("md") {
            continue;
        }
        let path_str = path.to_string_lossy().into_owned();
        let hash = if kind == "removed" {
            None
        } else {
            fs::read(&path).ok().map(|bytes| hash_bytes(&bytes))
        };
        let payload = serde_json::json!({
            "path": path_str,
            "hash": hash,
            "kind": kind,
        });
        let _ = app.emit("vault:changed", payload);
    }
}

fn parse_entry(p: &Path, boards_dir: &Path) -> Option<VaultEntry> {
    if p.extension().and_then(|s| s.to_str()) != Some("md") {
        return None;
    }

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

fn hash_bytes(content: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content);
    format!("{:x}", hasher.finalize())
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
    fn hash_bytes_is_deterministic_and_hex_encoded() {
        let h1 = hash_bytes(b"hello");
        let h2 = hash_bytes(b"hello");
        assert_eq!(h1, h2);
        assert_eq!(h1.len(), 64);
        assert!(h1.chars().all(|c| c.is_ascii_hexdigit()));
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
}
