//! Boards and columns: listing, creating, and the column structure commands
//! (create/delete/rename + reorder). Column-order metadata lives in each
//! board's `_silex.json`; `BoardDir` centralizes the read/mutate/write dance.

use std::fs;
use std::path::{Path, PathBuf};

use crate::error::{Error, Result};
use crate::models::{BoardLayout, BoardMeta};
use crate::util::{is_invalid_segment, write_atomic};

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

fn write_board_meta(board_dir: &Path, meta: &BoardMeta) -> Result<()> {
    let meta_path = board_dir.join("_silex.json");
    let json = serde_json::to_string_pretty(meta)?;
    write_atomic(&meta_path, json.as_bytes())
}

/// A located board directory (`<vault>/boards/<name>`). Centralizes locating
/// the dir and reading/writing its column-order metadata, which the column
/// commands all need. Callers validate the board name themselves (each does so
/// in its own order/trimming, so name validation stays at the call site).
struct BoardDir {
    path: PathBuf,
}

impl BoardDir {
    fn locate(vault_path: &str, board_name: &str) -> Result<Self> {
        let path = PathBuf::from(vault_path).join("boards").join(board_name);
        if !path.is_dir() {
            return Err(Error::NotFound(format!("Board not found: {}", board_name)));
        }
        Ok(Self { path })
    }

    fn meta(&self) -> BoardMeta {
        read_board_meta(&self.path)
    }

    fn write_meta(&self, meta: &BoardMeta) -> Result<()> {
        write_board_meta(&self.path, meta)
    }

    fn column(&self, name: &str) -> PathBuf {
        self.path.join(name)
    }
}

#[tauri::command]
pub async fn list_boards(vault_path: String) -> Result<Vec<BoardLayout>> {
    let boards_dir = PathBuf::from(&vault_path).join("boards");
    if !boards_dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut layouts = Vec::new();
    let board_dirs = fs::read_dir(&boards_dir)?;

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
) -> Result<()> {
    if is_invalid_segment(&board_name) {
        return Err(Error::Invalid("Invalid board name".to_string()));
    }
    let board = BoardDir::locate(&vault_path, &board_name)?;
    board.write_meta(&BoardMeta { columns })
}

#[tauri::command]
pub async fn create_column(
    vault_path: String,
    board_name: String,
    column_name: String,
) -> Result<()> {
    let trimmed_board = board_name.trim();
    let trimmed_col = column_name.trim();
    if is_invalid_segment(trimmed_col) {
        return Err(Error::Invalid("Invalid column name".to_string()));
    }
    if is_invalid_segment(trimmed_board) {
        return Err(Error::Invalid("Invalid board name".to_string()));
    }
    let board = BoardDir::locate(&vault_path, trimmed_board)?;
    let column_dir = board.column(trimmed_col);
    if column_dir.exists() {
        return Err(Error::Conflict(format!(
            "Column '{}' already exists",
            trimmed_col
        )));
    }
    fs::create_dir_all(&column_dir)?;

    let mut meta = board.meta();
    if !meta.columns.contains(&trimmed_col.to_string()) {
        meta.columns.push(trimmed_col.to_string());
    }
    board.write_meta(&meta)?;
    Ok(())
}

#[tauri::command]
pub async fn delete_column(
    vault_path: String,
    board_name: String,
    column_name: String,
) -> Result<()> {
    if is_invalid_segment(&board_name) {
        return Err(Error::Invalid("Invalid board name".to_string()));
    }
    if is_invalid_segment(&column_name) {
        return Err(Error::Invalid("Invalid column name".to_string()));
    }
    let board = BoardDir::locate(&vault_path, &board_name)?;
    let column_dir = board.column(&column_name);
    if !column_dir.is_dir() {
        return Err(Error::NotFound(format!(
            "Column not found: {}/{}",
            board_name, column_name
        )));
    }

    trash::delete(&column_dir).map_err(|e| Error::Other(e.to_string()))?;

    let mut meta = board.meta();
    meta.columns.retain(|c| c != &column_name);
    board.write_meta(&meta)?;
    Ok(())
}

#[tauri::command]
pub async fn rename_column(
    vault_path: String,
    board_name: String,
    column_name: String,
    new_name: String,
) -> Result<()> {
    if is_invalid_segment(&board_name) {
        return Err(Error::Invalid("Invalid board name".to_string()));
    }
    if is_invalid_segment(&column_name) {
        return Err(Error::Invalid("Invalid column name".to_string()));
    }
    let trimmed = new_name.trim();
    if is_invalid_segment(trimmed) {
        return Err(Error::Invalid("Invalid column name".to_string()));
    }
    if trimmed == column_name {
        return Ok(());
    }

    let board = BoardDir::locate(&vault_path, &board_name)?;
    let from = board.column(&column_name);
    if !from.is_dir() {
        return Err(Error::NotFound(format!(
            "Column not found: {}/{}",
            board_name, column_name
        )));
    }
    let to = board.column(trimmed);
    if to.exists() {
        return Err(Error::Conflict(format!(
            "Column '{}' already exists in board '{}'",
            trimmed, board_name
        )));
    }

    fs::rename(&from, &to)?;

    let mut meta = board.meta();
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
    board.write_meta(&meta)?;
    Ok(())
}

#[tauri::command]
pub async fn create_board(vault_path: String, name: String) -> Result<String> {
    do_create_board(Path::new(&vault_path), &name).map(|p| p.to_string_lossy().into_owned())
}

fn do_create_board(vault: &Path, name: &str) -> Result<PathBuf> {
    let trimmed = name.trim();
    if is_invalid_segment(trimmed) {
        return Err(Error::Invalid("Invalid board name".to_string()));
    }
    let board_path = vault.join("boards").join(trimmed);
    if board_path.exists() {
        return Err(Error::Conflict(format!(
            "Board '{}' already exists",
            trimmed
        )));
    }
    let backlog = board_path.join("backlog");
    fs::create_dir_all(&backlog)?;
    Ok(board_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn create_board_creates_board_with_default_backlog_column() {
        let dir = tempfile::tempdir().unwrap();
        let result = do_create_board(dir.path(), "my-board").unwrap();
        assert_eq!(result, dir.path().join("boards").join("my-board"));
        assert!(dir
            .path()
            .join("boards")
            .join("my-board")
            .join("backlog")
            .is_dir());
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
        assert!(err.to_string().contains("already exists"));
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
            columns: vec![
                "backlog".to_string(),
                "in-progress".to_string(),
                "done".to_string(),
            ],
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
}
