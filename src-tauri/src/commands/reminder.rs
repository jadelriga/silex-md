//! Reminder creation. Reminders are markdown files under `<vault>/reminders/`
//! with `title` + `reminder` (ISO datetime) frontmatter.

use std::fs;
use std::path::{Path, PathBuf};

use crate::error::{Error, Result};
use crate::util::{slugify, unique_path, yaml_dq};

#[tauri::command]
#[specta::specta]
pub async fn create_reminder(
    vault_path: String,
    title: String,
    reminder: String,
) -> Result<String> {
    do_create_reminder(Path::new(&vault_path), &title, &reminder)
        .map(|p| p.to_string_lossy().into_owned())
}

fn do_create_reminder(vault: &Path, title: &str, reminder: &str) -> Result<PathBuf> {
    let trimmed_title = title.trim();
    if trimmed_title.is_empty() {
        return Err(Error::Invalid("Title cannot be empty".to_string()));
    }
    let trimmed_reminder = reminder.trim();
    if trimmed_reminder.is_empty() {
        return Err(Error::Invalid("Reminder time cannot be empty".to_string()));
    }

    let base_slug = slugify(trimmed_title);
    if base_slug.is_empty() {
        return Err(Error::Invalid("Title produces an empty slug".to_string()));
    }

    let reminders_dir = vault.join("reminders");
    fs::create_dir_all(&reminders_dir)?;

    let path = unique_path(&reminders_dir, &format!("{}.md", base_slug));

    let content = format!(
        "---\ntitle: {}\nreminder: {}\n---\n",
        yaml_dq(trimmed_title),
        yaml_dq(trimmed_reminder)
    );
    fs::write(&path, content)?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
