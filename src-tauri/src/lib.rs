mod commands;
mod pty;

use commands::{
    create_board, create_note, create_note_folder, delete_task, list_boards, move_task,
    read_bodies, read_entry, read_task_body, read_vault, watch_vault, write_task, WatcherState,
};
use pty::{shell_input, shell_kill, shell_resize, spawn_shell, PtyState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(WatcherState::new())
        .manage(PtyState::new())
        .invoke_handler(tauri::generate_handler![
            read_vault,
            read_entry,
            read_task_body,
            write_task,
            move_task,
            delete_task,
            watch_vault,
            list_boards,
            read_bodies,
            create_board,
            create_note_folder,
            create_note,
            spawn_shell,
            shell_input,
            shell_resize,
            shell_kill,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
