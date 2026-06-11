mod commands;
mod menu;
mod notify;
#[cfg(target_os = "macos")]
mod notify_mac;
mod pty;

use commands::{
    create_board, create_column, create_note, create_note_folder, create_reminder, create_task,
    delete_column, delete_path, delete_task, duplicate_task, list_boards, list_note_folders,
    move_task, read_bodies, read_entry, read_task_body, read_vault, rename_column,
    save_attachment, set_board_column_order, watch_vault, write_task, WatcherState,
};
use notify::{notify_native, take_pending_notification_click};
use pty::{shell_input, shell_kill, shell_resize, spawn_shell, PtyState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .manage(WatcherState::new())
        .manage(PtyState::new())
        .setup(|app| {
            // Updater is desktop-only; registered in setup so the cfg guard
            // can be a statement instead of a builder-chain entry.
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            let m = menu::build_menu(app.handle())?;
            app.set_menu(m)?;
            // Early registration matters: a notification click that launches
            // the app delivers its response right after the delegate is set.
            #[cfg(target_os = "macos")]
            notify_mac::init(app.handle().clone());
            Ok(())
        })
        .on_menu_event(|app, event| {
            menu::handle_menu_event(app, event.id().as_ref());
        })
        .invoke_handler(tauri::generate_handler![
            read_vault,
            read_entry,
            read_task_body,
            write_task,
            save_attachment,
            move_task,
            delete_task,
            watch_vault,
            list_boards,
            list_note_folders,
            read_bodies,
            create_board,
            create_column,
            create_note_folder,
            create_note,
            create_reminder,
            create_task,
            duplicate_task,
            delete_path,
            delete_column,
            rename_column,
            set_board_column_order,
            notify_native,
            take_pending_notification_click,
            spawn_shell,
            shell_input,
            shell_resize,
            shell_kill,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
