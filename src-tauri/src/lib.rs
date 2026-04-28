mod commands;

use commands::{delete_task, move_task, read_task_body, read_vault, write_task};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            read_vault,
            read_task_body,
            write_task,
            move_task,
            delete_task,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
