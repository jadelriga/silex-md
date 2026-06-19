use serde::{Deserialize, Serialize};

/// A single markdown file surfaced to the frontend. `kind` is one of
/// "task" | "note" | "reminder"; `board`/`column` are set only for tasks.
/// Field names cross the IPC boundary as camelCase (see the frontend's
/// `VaultEntry` interface).
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VaultEntry {
    pub path: String,
    pub kind: String,
    pub board: Option<String>,
    pub column: Option<String>,
    pub frontmatter: serde_json::Value,
    pub subtask_total: usize,
    pub subtask_done: usize,
}

/// A board and its ordered list of column names.
#[derive(Serialize, Deserialize, Clone)]
pub struct BoardLayout {
    pub name: String,
    pub columns: Vec<String>,
}

/// Contents of a board's `_silex.json` (column order).
#[derive(Serialize, Deserialize, Default, Clone)]
pub struct BoardMeta {
    #[serde(default)]
    pub columns: Vec<String>,
}

/// Payload emitted on the `vault:changed` event when the filesystem watcher
/// sees a `.md` file change. Serializes to exactly `{ path, hash, kind }` —
/// the shape the frontend's sync loop (`sync.ts`) expects, with `kind` one of
/// "created" | "modified" | "removed".
#[derive(Serialize, Clone)]
pub struct VaultChange {
    pub path: String,
    pub hash: Option<String>,
    pub kind: String,
}
