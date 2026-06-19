use serde::{Serialize, Serializer};

/// Unified error type for Silex's Tauri commands.
///
/// It serializes to a plain **string** (its `Display` form) rather than a
/// struct. This keeps the existing frontend contract intact: command
/// rejections arrive in JavaScript as strings, so every
/// `e instanceof Error ? e.message : String(e)` display site keeps working,
/// and — critically — `move_task`'s `"DestinationExists: <path>"` prefix,
/// which the UI matches on to show its "Replace file?" prompt
/// (`NotesTree.svelte`, `+layout.svelte`), is preserved byte-for-byte.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// A move/rename target already exists and overwrite was not requested.
    /// The `DestinationExists:` prefix is load-bearing — the frontend matches it.
    #[error("DestinationExists: {0}")]
    DestinationExists(String),

    /// A vault path, board, column, note, or file could not be found.
    #[error("{0}")]
    NotFound(String),

    /// Invalid user input: bad name, empty title/path, path traversal, etc.
    #[error("{0}")]
    Invalid(String),

    /// A create/rename operation collided with an existing entity.
    #[error("{0}")]
    Conflict(String),

    /// Catch-all for messages that don't fit a more specific variant
    /// (keeps parity with the old ad-hoc `format!` strings).
    #[error("{0}")]
    Other(String),

    #[error(transparent)]
    Io(#[from] std::io::Error),

    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

impl Serialize for Error {
    // NB: `Result` in this module is our own alias below, so the std two-arg
    // Result must be spelled out here.
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, Error>;
