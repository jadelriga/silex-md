use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use gray_matter::engine::YAML;
use gray_matter::Matter;
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, State};
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

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct BoardMeta {
    #[serde(default)]
    pub columns: Vec<String>,
}

/// Returns true if `name` is unsafe to use as a single path segment on any
/// of our target OSes (macOS, Linux, Windows). Specifically rejects empty
/// strings, anything containing `/` or `\` or `..`, names that end in `.`
/// or space (Windows silently strips those, corrupting the resulting path),
/// and the Windows reserved device names (`CON`, `PRN`, `AUX`, `NUL`,
/// `COM1`–`COM9`, `LPT1`–`LPT9`).
fn is_invalid_segment(name: &str) -> bool {
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
        "CON" | "PRN" | "AUX" | "NUL"
        | "COM1" | "COM2" | "COM3" | "COM4" | "COM5"
        | "COM6" | "COM7" | "COM8" | "COM9"
        | "LPT1" | "LPT2" | "LPT3" | "LPT4" | "LPT5"
        | "LPT6" | "LPT7" | "LPT8" | "LPT9"
    )
}

fn read_board_meta(board_dir: &Path) -> BoardMeta {
    let meta_path = board_dir.join("_silex.json");
    if !meta_path.is_file() {
        return BoardMeta::default();
    }
    let content = match fs::read_to_string(&meta_path) {
        Ok(c) => c,
        Err(_) => return BoardMeta::default(),
    };
    serde_json::from_str(&content).unwrap_or_default()
}

fn write_board_meta(board_dir: &Path, meta: &BoardMeta) -> Result<(), String> {
    let meta_path = board_dir.join("_silex.json");
    let json = serde_json::to_string_pretty(meta).map_err(|e| e.to_string())?;
    fs::write(&meta_path, json).map_err(|e| e.to_string())
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
pub async fn list_note_folders(vault_path: String) -> Result<Vec<String>, String> {
    let vault = PathBuf::from(&vault_path);
    if !vault.is_dir() {
        return Err(format!("Vault path is not a directory: {}", vault_path));
    }
    do_list_note_folders(&vault)
}

fn do_list_note_folders(vault: &Path) -> Result<Vec<String>, String> {
    let boards_dir = vault.join("boards");
    let templates_dir = vault.join("templates");
    let reminders_dir = vault.join("reminders");
    let attachments_dir = vault.join("attachments");
    let mut out: Vec<String> = Vec::new();

    for entry in WalkDir::new(&vault)
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
        if let Ok(rel) = p.strip_prefix(&vault) {
            out.push(rel.to_string_lossy().into_owned());
        }
    }
    out.sort();
    Ok(out)
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
        let board_path = board_entry.path();

        let mut existing_columns: Vec<String> = Vec::new();
        if let Ok(col_dirs) = fs::read_dir(&board_path) {
            for col_entry in col_dirs.flatten() {
                if col_entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                    existing_columns.push(col_entry.file_name().to_string_lossy().into_owned());
                }
            }
        }
        existing_columns.sort();

        let meta = read_board_meta(&board_path);
        let mut ordered_columns: Vec<String> = Vec::new();
        for c in &meta.columns {
            if existing_columns.contains(c) && !ordered_columns.contains(c) {
                ordered_columns.push(c.clone());
            }
        }
        for c in &existing_columns {
            if !ordered_columns.contains(c) {
                ordered_columns.push(c.clone());
            }
        }

        layouts.push(BoardLayout {
            name: board_name,
            columns: ordered_columns,
        });
    }
    layouts.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(layouts)
}

#[tauri::command]
pub async fn set_board_column_order(
    vault_path: String,
    board_name: String,
    columns: Vec<String>,
) -> Result<(), String> {
    if is_invalid_segment(&board_name) {
        return Err("Invalid board name".to_string());
    }
    let board_dir = PathBuf::from(&vault_path).join("boards").join(&board_name);
    if !board_dir.is_dir() {
        return Err(format!("Board not found: {}", board_name));
    }
    write_board_meta(&board_dir, &BoardMeta { columns })
}

#[tauri::command]
pub async fn create_reminder(
    vault_path: String,
    title: String,
    reminder: String,
) -> Result<String, String> {
    do_create_reminder(Path::new(&vault_path), &title, &reminder)
        .map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn create_task(
    vault_path: String,
    board_name: String,
    column_name: String,
    title: String,
    order: Option<String>,
) -> Result<String, String> {
    do_create_task(
        Path::new(&vault_path),
        &board_name,
        &column_name,
        &title,
        order.as_deref(),
    )
    .map(|p| p.to_string_lossy().into_owned())
}

fn do_create_task(
    vault: &Path,
    board: &str,
    column: &str,
    title: &str,
    order: Option<&str>,
) -> Result<PathBuf, String> {
    let trimmed_title = title.trim();
    if trimmed_title.is_empty() {
        return Err("Title cannot be empty".to_string());
    }
    let trimmed_board = board.trim();
    let trimmed_column = column.trim();
    if is_invalid_segment(trimmed_board) {
        return Err("Invalid board name".to_string());
    }
    if is_invalid_segment(trimmed_column) {
        return Err("Invalid column name".to_string());
    }

    let column_dir = vault
        .join("boards")
        .join(trimmed_board)
        .join(trimmed_column);
    if !column_dir.is_dir() {
        return Err(format!(
            "Column not found: {}/{}",
            trimmed_board, trimmed_column
        ));
    }

    let base_slug = slugify(trimmed_title);
    if base_slug.is_empty() {
        return Err("Title produces an empty slug".to_string());
    }

    let mut counter = 0;
    let mut slug = base_slug.clone();
    let mut path = column_dir.join(format!("{}.md", slug));
    while path.exists() {
        counter += 1;
        slug = format!("{}-{}", base_slug, counter);
        path = column_dir.join(format!("{}.md", slug));
    }

    let mut content = String::from("---\n");
    content.push_str(&format!("title: {}\n", yaml_dq(trimmed_title)));
    if let Some(o) = order {
        content.push_str(&format!("order: {}\n", yaml_dq(o)));
    }
    content.push_str("---\n");

    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(path)
}

fn do_create_reminder(vault: &Path, title: &str, reminder: &str) -> Result<PathBuf, String> {
    let trimmed_title = title.trim();
    if trimmed_title.is_empty() {
        return Err("Title cannot be empty".to_string());
    }
    let trimmed_reminder = reminder.trim();
    if trimmed_reminder.is_empty() {
        return Err("Reminder time cannot be empty".to_string());
    }

    let base_slug = slugify(trimmed_title);
    if base_slug.is_empty() {
        return Err("Title produces an empty slug".to_string());
    }

    let reminders_dir = vault.join("reminders");
    fs::create_dir_all(&reminders_dir).map_err(|e| e.to_string())?;

    let mut counter = 0;
    let mut slug = base_slug.clone();
    let mut path = reminders_dir.join(format!("{}.md", slug));
    while path.exists() {
        counter += 1;
        slug = format!("{}-{}", base_slug, counter);
        path = reminders_dir.join(format!("{}.md", slug));
    }

    let content = format!(
        "---\ntitle: {}\nreminder: {}\n---\n",
        yaml_dq(trimmed_title),
        yaml_dq(trimmed_reminder)
    );
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(path)
}

fn slugify(s: &str) -> String {
    let lower = s.to_lowercase();
    let parts: Vec<String> = lower
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect();
    parts.join("-")
}

fn yaml_dq(s: &str) -> String {
    let escaped = s
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', " ")
        .replace('\r', " ");
    format!("\"{}\"", escaped)
}

#[tauri::command]
pub async fn create_column(
    vault_path: String,
    board_name: String,
    column_name: String,
) -> Result<(), String> {
    let trimmed_board = board_name.trim();
    let trimmed_col = column_name.trim();
    if is_invalid_segment(trimmed_col) {
        return Err("Invalid column name".to_string());
    }
    if is_invalid_segment(trimmed_board) {
        return Err("Invalid board name".to_string());
    }
    let board_dir = PathBuf::from(&vault_path).join("boards").join(trimmed_board);
    if !board_dir.is_dir() {
        return Err(format!("Board not found: {}", trimmed_board));
    }
    let column_dir = board_dir.join(trimmed_col);
    if column_dir.exists() {
        return Err(format!("Column '{}' already exists", trimmed_col));
    }
    fs::create_dir_all(&column_dir).map_err(|e| e.to_string())?;

    let mut meta = read_board_meta(&board_dir);
    if !meta.columns.contains(&trimmed_col.to_string()) {
        meta.columns.push(trimmed_col.to_string());
    }
    write_board_meta(&board_dir, &meta)?;
    Ok(())
}

#[tauri::command]
pub async fn read_task_body(path: String) -> Result<String, String> {
    let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let parsed = Matter::<YAML>::new().parse(&content);
    Ok(parsed.content)
}

#[tauri::command]
pub async fn read_bodies(
    vault_path: String,
) -> Result<std::collections::HashMap<String, String>, String> {
    let vault = PathBuf::from(&vault_path);
    if !vault.is_dir() {
        return Err(format!("Vault path is not a directory: {}", vault_path));
    }
    let templates_dir = vault.join("templates");
    let mut out = std::collections::HashMap::new();
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

/// Saves a pasted image into `<vault>/attachments/` and returns the
/// vault-rooted markdown path (`/attachments/<name>`). The image bytes arrive
/// as the raw IPC body (avoids JSON-encoding megabytes); the vault path and
/// suggested filename come in `x-vault` / `x-filename` headers. Header values
/// must be ASCII, so the JS side percent-encodes the vault path (the filename
/// is app-generated ASCII). Sync command: `Request` is a borrowed type, which
/// async commands don't support.
#[tauri::command]
pub fn save_attachment(request: tauri::ipc::Request<'_>) -> Result<String, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("save_attachment expects a raw binary body".to_string());
    };
    let header = |name: &str| {
        request
            .headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(|v| v.to_string())
    };
    let vault_encoded = header("x-vault").ok_or("missing x-vault header")?;
    let vault = percent_encoding::percent_decode_str(&vault_encoded)
        .decode_utf8()
        .map_err(|e| e.to_string())?
        .into_owned();
    let name = header("x-filename").unwrap_or_default();
    do_save_attachment(Path::new(&vault), &name, bytes)
}

fn do_save_attachment(vault: &Path, name: &str, bytes: &[u8]) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("Refusing to save an empty attachment".to_string());
    }
    // Fall back to a generated name rather than erroring: the name is
    // app-generated convenience metadata, not user input worth rejecting over.
    let safe_name = if is_invalid_segment(name) {
        format!("pasted-{}.png", now_millis())
    } else {
        name.to_string()
    };

    let attachments = vault.join("attachments");
    fs::create_dir_all(&attachments).map_err(|e| e.to_string())?;
    let final_path = unique_path(&attachments, &safe_name);

    let mut tmp = NamedTempFile::new_in(&attachments).map_err(|e| e.to_string())?;
    tmp.write_all(bytes).map_err(|e| e.to_string())?;
    tmp.flush().map_err(|e| e.to_string())?;
    tmp.persist(&final_path).map_err(|e| e.to_string())?;

    let file_name = final_path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .ok_or("attachment path has no file name")?;
    Ok(format!("/attachments/{}", file_name))
}

/// Returns a non-colliding path inside `dir` for `name`, appending `-N`
/// before the extension if needed.
fn unique_path(dir: &Path, name: &str) -> PathBuf {
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

fn now_millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

#[tauri::command]
pub async fn move_task(
    from: String,
    to: String,
    overwrite: Option<bool>,
) -> Result<(), String> {
    let from_p = PathBuf::from(&from);
    let to_p = PathBuf::from(&to);

    if from_p == to_p {
        return Ok(());
    }
    if to_p.exists() && !overwrite.unwrap_or(false) {
        return Err(format!("DestinationExists: {}", to));
    }

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
pub async fn delete_path(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    trash::delete(&p).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_column(
    vault_path: String,
    board_name: String,
    column_name: String,
) -> Result<(), String> {
    if is_invalid_segment(&board_name) {
        return Err("Invalid board name".to_string());
    }
    if is_invalid_segment(&column_name) {
        return Err("Invalid column name".to_string());
    }
    let board_dir = PathBuf::from(&vault_path).join("boards").join(&board_name);
    if !board_dir.is_dir() {
        return Err(format!("Board not found: {}", board_name));
    }
    let column_dir = board_dir.join(&column_name);
    if !column_dir.is_dir() {
        return Err(format!("Column not found: {}/{}", board_name, column_name));
    }

    trash::delete(&column_dir).map_err(|e| e.to_string())?;

    let mut meta = read_board_meta(&board_dir);
    meta.columns.retain(|c| c != &column_name);
    write_board_meta(&board_dir, &meta)?;
    Ok(())
}

#[tauri::command]
pub async fn rename_column(
    vault_path: String,
    board_name: String,
    column_name: String,
    new_name: String,
) -> Result<(), String> {
    if is_invalid_segment(&board_name) {
        return Err("Invalid board name".to_string());
    }
    if is_invalid_segment(&column_name) {
        return Err("Invalid column name".to_string());
    }
    let trimmed = new_name.trim();
    if is_invalid_segment(trimmed) {
        return Err("Invalid column name".to_string());
    }
    if trimmed == column_name {
        return Ok(());
    }

    let board_dir = PathBuf::from(&vault_path).join("boards").join(&board_name);
    if !board_dir.is_dir() {
        return Err(format!("Board not found: {}", board_name));
    }
    let from = board_dir.join(&column_name);
    if !from.is_dir() {
        return Err(format!("Column not found: {}/{}", board_name, column_name));
    }
    let to = board_dir.join(trimmed);
    if to.exists() {
        return Err(format!(
            "Column '{}' already exists in board '{}'",
            trimmed, board_name
        ));
    }

    fs::rename(&from, &to).map_err(|e| e.to_string())?;

    let mut meta = read_board_meta(&board_dir);
    let mut found = false;
    for c in meta.columns.iter_mut() {
        if c == &column_name {
            *c = trimmed.to_string();
            found = true;
        }
    }
    if !found {
        meta.columns.push(trimmed.to_string());
    }
    write_board_meta(&board_dir, &meta)?;
    Ok(())
}

#[tauri::command]
pub async fn create_board(vault_path: String, name: String) -> Result<String, String> {
    do_create_board(Path::new(&vault_path), &name)
        .map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn create_note_folder(
    vault_path: String,
    relative_path: String,
) -> Result<String, String> {
    do_create_note_folder(Path::new(&vault_path), &relative_path)
        .map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
pub async fn create_note(vault_path: String, relative_path: String) -> Result<String, String> {
    do_create_note(Path::new(&vault_path), &relative_path)
        .map(|p| p.to_string_lossy().into_owned())
}

fn do_create_board(vault: &Path, name: &str) -> Result<PathBuf, String> {
    let trimmed = name.trim();
    if is_invalid_segment(trimmed) {
        return Err("Invalid board name".to_string());
    }
    let board_path = vault.join("boards").join(trimmed);
    if board_path.exists() {
        return Err(format!("Board '{}' already exists", trimmed));
    }
    let backlog = board_path.join("backlog");
    fs::create_dir_all(&backlog).map_err(|e| e.to_string())?;
    Ok(board_path)
}

fn do_create_note_folder(vault: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let segments = validate_note_relative(relative_path)?;
    if segments.is_empty() {
        return Err("Folder path cannot be empty".to_string());
    }
    let mut folder_path = vault.to_path_buf();
    for seg in &segments {
        folder_path.push(seg);
    }
    if folder_path.exists() {
        return Err(format!("Folder already exists: {}", relative_path));
    }
    fs::create_dir_all(&folder_path).map_err(|e| e.to_string())?;
    Ok(folder_path)
}

fn do_create_note(vault: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let segments = validate_note_relative(relative_path)?;
    if segments.is_empty() {
        return Err("Note path cannot be empty".to_string());
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
        return Err(format!("Note already exists: {}", path.display()));
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, "").map_err(|e| e.to_string())?;
    Ok(path)
}

fn validate_note_relative(relative_path: &str) -> Result<Vec<String>, String> {
    let trimmed = relative_path.trim();
    if trimmed.is_empty() {
        return Err("Path cannot be empty".to_string());
    }
    if trimmed.starts_with('/') {
        return Err("Path must be relative (no leading '/')".to_string());
    }
    let segments: Vec<String> = trimmed
        .split('/')
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect();
    for seg in &segments {
        if seg == ".." || seg == "." {
            return Err("Path cannot contain '.' or '..' segments".to_string());
        }
        if is_invalid_segment(seg) {
            return Err(format!("Invalid path segment: '{}'", seg));
        }
    }
    if segments.first().map(|s| s.as_str()) == Some("boards") {
        return Err("Notes cannot live under '/boards'".to_string());
    }
    Ok(segments)
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
    let mut watcher =
        notify::recommended_watcher(move |res: notify::Result<notify::Event>| match res {
            Ok(event) => emit_change(&app_for_cb, event),
            Err(e) => eprintln!("Watcher error: {:?}", e),
        })
        .map_err(|e| e.to_string())?;

    watcher
        .watch(Path::new(&path), RecursiveMode::Recursive)
        .map_err(|e| e.to_string())?;
    *guard = Some(watcher);

    // Grant the webview asset:// read access to the vault tree so locally
    // referenced images render. The static scope in tauri.conf.json is empty;
    // this runtime grant re-applies on every vault open.
    app.asset_protocol_scope()
        .allow_directory(Path::new(&path), true)
        .map_err(|e| e.to_string())?;
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

    #[test]
    fn create_board_creates_board_with_default_backlog_column() {
        let dir = tempfile::tempdir().unwrap();
        let result = do_create_board(dir.path(), "my-board").unwrap();
        assert_eq!(result, dir.path().join("boards").join("my-board"));
        assert!(dir.path().join("boards").join("my-board").join("backlog").is_dir());
    }

    #[test]
    fn create_board_rejects_empty_name() {
        let dir = tempfile::tempdir().unwrap();
        assert!(do_create_board(dir.path(), "  ").is_err());
    }

    #[test]
    fn create_board_rejects_slashes_and_dotdot() {
        let dir = tempfile::tempdir().unwrap();
        assert!(do_create_board(dir.path(), "foo/bar").is_err());
        assert!(do_create_board(dir.path(), "..").is_err());
    }

    #[test]
    fn create_board_rejects_duplicates() {
        let dir = tempfile::tempdir().unwrap();
        do_create_board(dir.path(), "alpha").unwrap();
        let err = do_create_board(dir.path(), "alpha").unwrap_err();
        assert!(err.contains("already exists"));
    }

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
        assert!(dir.path().join("journal").join("april").join("29.md").is_file());
    }

    #[test]
    fn create_note_rejects_duplicates() {
        let dir = tempfile::tempdir().unwrap();
        do_create_note(dir.path(), "a").unwrap();
        let err = do_create_note(dir.path(), "a").unwrap_err();
        assert!(err.contains("already exists"));
    }

    #[test]
    fn create_note_rejects_paths_under_boards() {
        let dir = tempfile::tempdir().unwrap();
        assert!(do_create_note(dir.path(), "boards/foo").is_err());
    }

    #[test]
    fn read_board_meta_returns_default_when_file_is_missing() {
        let dir = tempfile::tempdir().unwrap();
        let meta = read_board_meta(dir.path());
        assert!(meta.columns.is_empty());
    }

    #[test]
    fn write_then_read_board_meta_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let original = BoardMeta {
            columns: vec!["backlog".to_string(), "in-progress".to_string(), "done".to_string()],
        };
        write_board_meta(dir.path(), &original).unwrap();
        let loaded = read_board_meta(dir.path());
        assert_eq!(loaded.columns, original.columns);
    }

    #[test]
    fn read_board_meta_returns_default_for_invalid_json() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("_silex.json"), "not json").unwrap();
        let meta = read_board_meta(dir.path());
        assert!(meta.columns.is_empty());
    }

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
    fn create_reminder_creates_file_under_reminders_with_frontmatter() {
        let dir = tempfile::tempdir().unwrap();
        let path = do_create_reminder(dir.path(), "Call dentist", "2026-05-10T14:30").unwrap();
        assert_eq!(path, dir.path().join("reminders").join("call-dentist.md"));
        let content = fs::read_to_string(&path).unwrap();
        assert!(content.contains("title: \"Call dentist\""));
        assert!(content.contains("reminder: \"2026-05-10T14:30\""));
    }

    #[test]
    fn create_reminder_appends_counter_on_collision() {
        let dir = tempfile::tempdir().unwrap();
        let p1 = do_create_reminder(dir.path(), "Same title", "2026-05-10T10:00").unwrap();
        let p2 = do_create_reminder(dir.path(), "Same title", "2026-05-10T11:00").unwrap();
        assert_eq!(p1, dir.path().join("reminders").join("same-title.md"));
        assert_eq!(p2, dir.path().join("reminders").join("same-title-1.md"));
    }

    #[test]
    fn create_reminder_rejects_empty_title() {
        let dir = tempfile::tempdir().unwrap();
        assert!(do_create_reminder(dir.path(), "  ", "2026-05-10T10:00").is_err());
        assert!(do_create_reminder(dir.path(), "!!!", "2026-05-10T10:00").is_err());
    }

    #[test]
    fn create_reminder_rejects_empty_reminder_time() {
        let dir = tempfile::tempdir().unwrap();
        assert!(do_create_reminder(dir.path(), "Title", "").is_err());
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

    #[test]
    fn create_task_creates_file_under_correct_column() {
        let dir = tempfile::tempdir().unwrap();
        let column_dir = dir.path().join("boards").join("my-board").join("backlog");
        fs::create_dir_all(&column_dir).unwrap();
        let path = do_create_task(dir.path(), "my-board", "backlog", "Fix bug", None).unwrap();
        assert_eq!(path, column_dir.join("fix-bug.md"));
        let content = fs::read_to_string(&path).unwrap();
        assert!(content.contains("title: \"Fix bug\""));
        assert!(!content.contains("order:"));
    }

    #[test]
    fn create_task_includes_order_when_provided() {
        let dir = tempfile::tempdir().unwrap();
        let column_dir = dir.path().join("boards").join("b").join("c");
        fs::create_dir_all(&column_dir).unwrap();
        let path = do_create_task(dir.path(), "b", "c", "T", Some("a3")).unwrap();
        let content = fs::read_to_string(&path).unwrap();
        assert!(content.contains("order: \"a3\""));
    }

    #[test]
    fn create_task_appends_counter_on_collision() {
        let dir = tempfile::tempdir().unwrap();
        let column_dir = dir.path().join("boards").join("b").join("c");
        fs::create_dir_all(&column_dir).unwrap();
        let p1 = do_create_task(dir.path(), "b", "c", "Fix bug", None).unwrap();
        let p2 = do_create_task(dir.path(), "b", "c", "Fix bug", None).unwrap();
        assert_eq!(p1, column_dir.join("fix-bug.md"));
        assert_eq!(p2, column_dir.join("fix-bug-1.md"));
    }

    #[test]
    fn create_task_rejects_empty_title() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join("boards").join("b").join("c")).unwrap();
        assert!(do_create_task(dir.path(), "b", "c", "  ", None).is_err());
        assert!(do_create_task(dir.path(), "b", "c", "!!!", None).is_err());
    }

    #[test]
    fn create_task_rejects_invalid_board_or_column() {
        let dir = tempfile::tempdir().unwrap();
        assert!(do_create_task(dir.path(), "", "c", "T", None).is_err());
        assert!(do_create_task(dir.path(), "b/x", "c", "T", None).is_err());
        assert!(do_create_task(dir.path(), "..", "c", "T", None).is_err());
        assert!(do_create_task(dir.path(), "b", "", "T", None).is_err());
        assert!(do_create_task(dir.path(), "b", "..", "T", None).is_err());
    }

    #[test]
    fn create_task_rejects_when_column_does_not_exist() {
        let dir = tempfile::tempdir().unwrap();
        assert!(do_create_task(dir.path(), "b", "c", "T", None).is_err());
    }

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
