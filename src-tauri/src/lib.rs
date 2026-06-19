mod commands;
mod error;
mod menu;
mod models;
mod pty;
mod util;

use commands::{
    create_board, create_column, create_note, create_note_folder, create_reminder, create_task,
    delete_column, delete_path, delete_task, list_boards, list_note_folders, move_task,
    read_bodies, read_entry, read_task_body, read_vault, rename_column, save_attachment,
    set_board_column_order, watch_vault, write_task, WatcherState,
};
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
            delete_path,
            delete_column,
            rename_column,
            set_board_column_order,
            spawn_shell,
            shell_input,
            shell_resize,
            shell_kill,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// Single source of truth for the generated binding surface. Only the export
// test below uses it: the runtime handler in `run()` stays a plain
// `generate_handler!`. `save_attachment` (raw IPC body) and the pty commands are
// intentionally excluded from the typed surface.
//
// This lives at the crate root — not in a submodule — on purpose: the
// `#[specta::specta]` companion macros that `collect_commands!` expands to are
// `#[macro_export]`ed (crate root) and invoked unqualified, so they only resolve
// where the command idents are already in scope (the top-of-file `use
// commands::{...}`), i.e. here.
#[cfg(test)]
fn specta_builder() -> tauri_specta::Builder<tauri::Wry> {
    tauri_specta::Builder::<tauri::Wry>::new()
        // Generated commands reject (throw) on error rather than returning a
        // Result envelope, so the frontend keeps its existing catch-based
        // contract (incl. the "DestinationExists:" prefix match).
        .error_handling(tauri_specta::ErrorHandlingMode::Throw)
        .commands(tauri_specta::collect_commands![
            read_vault,
            read_entry,
            read_task_body,
            read_bodies,
            create_task,
            write_task,
            move_task,
            delete_task,
            delete_path,
            list_boards,
            create_board,
            create_column,
            delete_column,
            rename_column,
            set_board_column_order,
            create_note,
            create_note_folder,
            list_note_folders,
            create_reminder,
            watch_vault,
        ])
        .events(tauri_specta::collect_events![models::VaultChange])
}

// Regenerates src/lib/bindings.ts from the Rust types. CI runs this via
// `cargo test` and then `git diff --exit-code src/lib/bindings.ts` to fail if
// the committed bindings have drifted from the Rust source.
#[cfg(test)]
#[test]
fn bindings_are_up_to_date() {
    specta_builder()
        .export(
            // usize (subtask counts) -> TS `number`; the values are tiny, so the
            // BigInt-truncation caveat doesn't apply. Matches the old hand-written
            // `subtaskTotal: number`.
            specta_typescript::Typescript::default()
                .bigint(specta_typescript::BigIntExportBehavior::Number),
            concat!(env!("CARGO_MANIFEST_DIR"), "/../src/lib/bindings.ts"),
        )
        .expect("failed to export TypeScript bindings");
}
