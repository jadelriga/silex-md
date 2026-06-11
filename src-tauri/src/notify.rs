//! Cross-platform wrappers over the macOS-only native notification path.
//! On other platforms (and in dev mode, where there's no app bundle) these
//! report "not handled" and the frontend falls back to
//! tauri-plugin-notification.

#[tauri::command]
pub fn notify_native(title: String, body: String, target_path: String) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        Ok(crate::notify_mac::send(&title, &body, &target_path))
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (title, body, target_path);
        Ok(false)
    }
}

#[tauri::command]
pub fn take_pending_notification_click() -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        crate::notify_mac::take_pending()
    }
    #[cfg(not(target_os = "macos"))]
    {
        None
    }
}
