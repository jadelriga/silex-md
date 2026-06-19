//! Task creation plus the path-level file mutations the kanban UI drives:
//! write, move, and delete. `move_task`/`delete_path` are path-generic — the
//! frontend also reuses them for notes and boards (`movePath`/`deletePath`).

use std::fs;
use std::path::{Path, PathBuf};

use crate::error::{Error, Result};
use crate::util::{hash_bytes, is_invalid_segment, slugify, unique_path, write_atomic, yaml_dq};

#[tauri::command]
#[specta::specta]
pub async fn create_task(
    vault_path: String,
    board_name: String,
    column_name: String,
    title: String,
    order: Option<String>,
) -> Result<String> {
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
) -> Result<PathBuf> {
    let trimmed_title = title.trim();
    if trimmed_title.is_empty() {
        return Err(Error::Invalid("Title cannot be empty".to_string()));
    }
    let trimmed_board = board.trim();
    let trimmed_column = column.trim();
    if is_invalid_segment(trimmed_board) {
        return Err(Error::Invalid("Invalid board name".to_string()));
    }
    if is_invalid_segment(trimmed_column) {
        return Err(Error::Invalid("Invalid column name".to_string()));
    }

    let column_dir = vault
        .join("boards")
        .join(trimmed_board)
        .join(trimmed_column);
    if !column_dir.is_dir() {
        return Err(Error::NotFound(format!(
            "Column not found: {}/{}",
            trimmed_board, trimmed_column
        )));
    }

    let base_slug = slugify(trimmed_title);
    if base_slug.is_empty() {
        return Err(Error::Invalid("Title produces an empty slug".to_string()));
    }

    let path = unique_path(&column_dir, &format!("{}.md", base_slug));

    let mut content = String::from("---\n");
    content.push_str(&format!("title: {}\n", yaml_dq(trimmed_title)));
    if let Some(o) = order {
        content.push_str(&format!("order: {}\n", yaml_dq(o)));
    }
    content.push_str("---\n");

    fs::write(&path, content)?;
    Ok(path)
}

#[tauri::command]
#[specta::specta]
pub async fn write_task(path: String, content: String) -> Result<String> {
    let p = PathBuf::from(&path);
    write_atomic(&p, content.as_bytes())?;
    Ok(hash_bytes(content.as_bytes()))
}

#[tauri::command]
#[specta::specta]
pub async fn move_task(from: String, to: String, overwrite: Option<bool>) -> Result<()> {
    let from_p = PathBuf::from(&from);
    let to_p = PathBuf::from(&to);

    if from_p == to_p {
        return Ok(());
    }
    if to_p.exists() && !overwrite.unwrap_or(false) {
        return Err(Error::DestinationExists(to.clone()));
    }

    if let Some(parent) = to_p.parent() {
        fs::create_dir_all(parent)?;
    }

    if fs::rename(&from_p, &to_p).is_ok() {
        return Ok(());
    }

    fs::copy(&from_p, &to_p)?;
    fs::remove_file(&from_p)?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn delete_task(path: String) -> Result<()> {
    Ok(fs::remove_file(&path)?)
}

#[tauri::command]
#[specta::specta]
pub async fn delete_path(path: String) -> Result<()> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(Error::NotFound(format!("Path does not exist: {}", path)));
    }
    trash::delete(&p).map_err(|e| Error::Other(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
