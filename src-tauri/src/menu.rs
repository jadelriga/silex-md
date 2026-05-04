use tauri::menu::{
    AboutMetadataBuilder, Menu, MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
};
use tauri::{AppHandle, Emitter, Wry};

pub fn build_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let preferences = MenuItemBuilder::with_id("preferences", "Preferences…")
        .accelerator("Cmd+,")
        .build(app)?;

    let about_metadata = AboutMetadataBuilder::new().name(Some("Silex")).build();

    let app_menu = SubmenuBuilder::new(app, "Silex")
        .item(&PredefinedMenuItem::about(
            app,
            Some("About Silex"),
            Some(about_metadata),
        )?)
        .separator()
        .item(&preferences)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let new_task = MenuItemBuilder::with_id("new-task", "New Task")
        .accelerator("CmdOrCtrl+Shift+N")
        .build(app)?;
    let new_note = MenuItemBuilder::with_id("new-note", "New Note")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;
    let new_board = MenuItemBuilder::with_id("new-board", "New Board")
        .accelerator("CmdOrCtrl+Shift+B")
        .build(app)?;
    let new_folder = MenuItemBuilder::with_id("new-folder", "New Folder").build(app)?;
    let new_reminder = MenuItemBuilder::with_id("new-reminder", "New Reminder").build(app)?;
    let open_vault = MenuItemBuilder::with_id("open-vault", "Open Vault…").build(app)?;
    let reveal_settings =
        MenuItemBuilder::with_id("reveal-settings", "Reveal Settings File").build(app)?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&new_task)
        .item(&new_note)
        .item(&new_board)
        .item(&new_folder)
        .item(&new_reminder)
        .separator()
        .item(&open_vault)
        .item(&reveal_settings)
        .build()?;

    let find = MenuItemBuilder::with_id("find", "Find…")
        .accelerator("CmdOrCtrl+Shift+F")
        .build(app)?;
    let palette = MenuItemBuilder::with_id("palette", "Quick Switcher")
        .accelerator("CmdOrCtrl+P")
        .build(app)?;
    let commands = MenuItemBuilder::with_id("commands", "Run Command")
        .accelerator("CmdOrCtrl+Shift+P")
        .build(app)?;

    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .separator()
        .item(&find)
        .item(&palette)
        .item(&commands)
        .build()?;

    let toggle_terminal = MenuItemBuilder::with_id("toggle-terminal", "Toggle Terminal")
        .accelerator("CmdOrCtrl+J")
        .build(app)?;
    let calendar = MenuItemBuilder::with_id("calendar", "Calendar").build(app)?;
    let theme_system = MenuItemBuilder::with_id("theme-system", "Use System").build(app)?;
    let theme_light = MenuItemBuilder::with_id("theme-light", "Light").build(app)?;
    let theme_dark = MenuItemBuilder::with_id("theme-dark", "Dark").build(app)?;

    let theme_menu = SubmenuBuilder::new(app, "Theme")
        .item(&theme_system)
        .item(&theme_light)
        .item(&theme_dark)
        .build()?;

    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&toggle_terminal)
        .item(&calendar)
        .separator()
        .item(&theme_menu)
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .close_window()
        .build()?;

    MenuBuilder::new(app)
        .items(&[
            &app_menu,
            &file_menu,
            &edit_menu,
            &view_menu,
            &window_menu,
        ])
        .build()
}

pub fn handle_menu_event(app: &AppHandle, id: &str) {
    let _ = app.emit(&format!("menu:{}", id), ());
}
