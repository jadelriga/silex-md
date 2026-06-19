//! Tauri command handlers, grouped by domain. Each submodule owns its
//! `#[tauri::command]` functions plus their private helpers and tests; this
//! file re-exports them so `lib.rs` can register them from one place.

pub mod attachment;
pub mod board;
pub mod note;
pub mod reminder;
pub mod task;
pub mod vault;
pub mod watcher;

pub use attachment::save_attachment;
pub use board::{
    create_board, create_column, delete_column, list_boards, rename_column, set_board_column_order,
};
pub use note::{create_note, create_note_folder, list_note_folders};
pub use reminder::create_reminder;
pub use task::{create_task, delete_path, delete_task, move_task, write_task};
pub use vault::{read_bodies, read_entry, read_task_body, read_vault};
pub use watcher::{watch_vault, WatcherState};
