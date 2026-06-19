//! Filesystem watcher: installs a `notify` recursive watcher over the vault
//! and emits a `vault:changed` event per `.md` change. `event_kind_str` and
//! `md_paths` are pure (and unit-tested); `emit_change` does the I/O.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::error::{Error, Result};
use crate::models::VaultChange;
use crate::util::hash_bytes;

pub struct WatcherState {
    pub watcher: Mutex<Option<RecommendedWatcher>>,
}

impl WatcherState {
    pub fn new() -> Self {
        Self {
            watcher: Mutex::new(None),
        }
    }
}

#[tauri::command]
pub async fn watch_vault(
    app: AppHandle,
    state: State<'_, WatcherState>,
    path: String,
) -> Result<()> {
    let mut guard = state
        .watcher
        .lock()
        .map_err(|e| Error::Other(e.to_string()))?;
    *guard = None;

    let app_for_cb = app.clone();
    let mut watcher =
        notify::recommended_watcher(move |res: notify::Result<notify::Event>| match res {
            Ok(event) => emit_change(&app_for_cb, event),
            Err(e) => eprintln!("Watcher error: {:?}", e),
        })
        .map_err(|e| Error::Other(e.to_string()))?;

    watcher
        .watch(Path::new(&path), RecursiveMode::Recursive)
        .map_err(|e| Error::Other(e.to_string()))?;
    *guard = Some(watcher);

    // Grant the webview asset:// read access to the vault tree so locally
    // referenced images render. The static scope in tauri.conf.json is empty;
    // this runtime grant re-applies on every vault open.
    app.asset_protocol_scope()
        .allow_directory(Path::new(&path), true)
        .map_err(|e| Error::Other(e.to_string()))?;
    Ok(())
}

/// Map a notify event kind to the string the frontend expects, or `None` for
/// kinds we ignore (access events, etc.).
fn event_kind_str(kind: &EventKind) -> Option<&'static str> {
    match kind {
        EventKind::Create(_) => Some("created"),
        EventKind::Modify(_) => Some("modified"),
        EventKind::Remove(_) => Some("removed"),
        _ => None,
    }
}

/// The `.md` paths carried by an event (the only ones we surface).
fn md_paths(event: &notify::Event) -> Vec<PathBuf> {
    event
        .paths
        .iter()
        .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("md"))
        .cloned()
        .collect()
}

fn emit_change(app: &AppHandle, event: notify::Event) {
    let Some(kind) = event_kind_str(&event.kind) else {
        return;
    };

    for path in md_paths(&event) {
        let hash = if kind == "removed" {
            None
        } else {
            fs::read(&path).ok().map(|bytes| hash_bytes(&bytes))
        };
        let change = VaultChange {
            path: path.to_string_lossy().into_owned(),
            hash,
            kind: kind.to_string(),
        };
        let _ = app.emit("vault:changed", change);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::event::{AccessKind, CreateKind, ModifyKind, RemoveKind};

    #[test]
    fn event_kind_str_maps_create_modify_remove_and_ignores_access() {
        assert_eq!(
            event_kind_str(&EventKind::Create(CreateKind::Any)),
            Some("created")
        );
        assert_eq!(
            event_kind_str(&EventKind::Modify(ModifyKind::Any)),
            Some("modified")
        );
        assert_eq!(
            event_kind_str(&EventKind::Remove(RemoveKind::Any)),
            Some("removed")
        );
        assert_eq!(event_kind_str(&EventKind::Access(AccessKind::Any)), None);
    }

    #[test]
    fn md_paths_keeps_only_markdown_files() {
        let event = notify::Event {
            kind: EventKind::Modify(ModifyKind::Any),
            paths: vec![
                PathBuf::from("/v/a.md"),
                PathBuf::from("/v/b.txt"),
                PathBuf::from("/v/sub/c.md"),
                PathBuf::from("/v/no-ext"),
            ],
            attrs: Default::default(),
        };
        assert_eq!(
            md_paths(&event),
            vec![PathBuf::from("/v/a.md"), PathBuf::from("/v/sub/c.md")]
        );
    }
}
