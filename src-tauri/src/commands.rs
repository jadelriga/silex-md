use std::fs;
use std::io::Write;
use std::path::PathBuf;

use gray_matter::engine::YAML;
use gray_matter::Matter;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tempfile::NamedTempFile;
use walkdir::WalkDir;

#[derive(Serialize, Deserialize)]
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

        let (kind, board, column) = if p.starts_with(&boards_dir) {
            let rel = match p.strip_prefix(&boards_dir) {
                Ok(r) => r,
                Err(_) => continue,
            };
            let parts: Vec<_> = rel.iter().collect();
            if parts.len() == 3 {
                let board = parts[0].to_string_lossy().into_owned();
                let column = parts[1].to_string_lossy().into_owned();
                ("task".to_string(), Some(board), Some(column))
            } else {
                continue;
            }
        } else {
            ("note".to_string(), None, None)
        };

        let content = match fs::read_to_string(p) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("Skipping {}: {}", p.display(), e);
                continue;
            }
        };

        let parsed = Matter::<YAML>::new().parse(&content);
        let frontmatter = parsed
            .data
            .and_then(|pod| pod.deserialize::<serde_json::Value>().ok())
            .unwrap_or(serde_json::Value::Null);
        let (subtask_total, subtask_done) = count_subtasks(&parsed.content);

        entries.push(VaultEntry {
            path: p.to_string_lossy().into_owned(),
            kind,
            board,
            column,
            frontmatter,
            subtask_total,
            subtask_done,
        });
    }

    Ok(entries)
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
