use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

pub struct PtySession {
    pub master: Box<dyn MasterPty + Send>,
    pub writer: Box<dyn Write + Send>,
    pub child: Box<dyn Child + Send + Sync>,
}

pub struct PtyState {
    pub sessions: Mutex<HashMap<String, PtySession>>,
}

impl PtyState {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }
}

static SESSION_ID_COUNTER: AtomicU64 = AtomicU64::new(0);

fn next_session_id() -> String {
    format!(
        "session-{}",
        SESSION_ID_COUNTER.fetch_add(1, Ordering::SeqCst)
    )
}

#[derive(Serialize, Clone)]
struct ShellOutput {
    id: String,
    data: String,
}

#[derive(Serialize, Clone)]
struct ShellExit {
    id: String,
}

#[tauri::command]
pub fn spawn_shell(
    app: AppHandle,
    state: State<'_, PtyState>,
    cwd: Option<String>,
) -> Result<String, String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
    let mut cmd = CommandBuilder::new(shell);
    if let Some(cwd) = cwd {
        cmd.cwd(cwd);
    }
    for (k, v) in std::env::vars() {
        cmd.env(&k, &v);
    }
    cmd.env("TERM", "xterm-256color");

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);

    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;

    let id = next_session_id();
    {
        let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
        sessions.insert(
            id.clone(),
            PtySession {
                master: pair.master,
                writer,
                child,
            },
        );
    }

    let id_for_thread = id.clone();
    let app_clone = app.clone();
    std::thread::spawn(move || {
        let mut reader = reader;
        let mut buf = [0u8; 8192];
        let mut pending: Vec<u8> = Vec::new();
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    pending.extend_from_slice(&buf[..n]);
                    let data = drain_valid_utf8(&mut pending);
                    if !data.is_empty() {
                        let _ = app_clone.emit(
                            "shell:output",
                            ShellOutput {
                                id: id_for_thread.clone(),
                                data,
                            },
                        );
                    }
                }
                Err(_) => break,
            }
        }
        // Shell closed; flush whatever's left so a final partial sequence
        // doesn't disappear silently.
        if !pending.is_empty() {
            let data = String::from_utf8_lossy(&pending).into_owned();
            let _ = app_clone.emit(
                "shell:output",
                ShellOutput {
                    id: id_for_thread.clone(),
                    data,
                },
            );
        }
        let _ = app_clone.emit("shell:exit", ShellExit { id: id_for_thread });
    });

    Ok(id)
}

/// Drain as much valid UTF-8 as possible from `pending`, leaving only a
/// trailing incomplete multi-byte sequence (if any) for the next read to
/// complete. Genuine invalid bytes are replaced with U+FFFD; partial
/// sequences at the end are held back. Without this, multi-byte glyphs
/// (Nerd Font icons, CJK, emoji) split across read boundaries get emitted
/// as U+FFFD and never recover.
fn drain_valid_utf8(pending: &mut Vec<u8>) -> String {
    let mut output = String::new();
    let mut consumed = 0;
    loop {
        let remaining = &pending[consumed..];
        if remaining.is_empty() {
            break;
        }
        match std::str::from_utf8(remaining) {
            Ok(s) => {
                output.push_str(s);
                consumed = pending.len();
                break;
            }
            Err(e) => {
                let valid = e.valid_up_to();
                if valid > 0 {
                    // SAFETY: from_utf8 said this prefix is valid.
                    output.push_str(std::str::from_utf8(&remaining[..valid]).unwrap());
                }
                match e.error_len() {
                    Some(skip) => {
                        output.push('\u{FFFD}');
                        consumed += valid + skip;
                    }
                    None => {
                        // Trailing incomplete sequence — wait for more bytes.
                        consumed += valid;
                        break;
                    }
                }
            }
        }
    }
    pending.drain(..consumed);
    output
}

#[tauri::command]
pub fn shell_input(
    state: State<'_, PtyState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get_mut(&session_id)
        .ok_or_else(|| format!("Unknown session: {}", session_id))?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn shell_resize(
    state: State<'_, PtyState>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    let session = sessions
        .get(&session_id)
        .ok_or_else(|| format!("Unknown session: {}", session_id))?;
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn shell_kill(state: State<'_, PtyState>, session_id: String) -> Result<(), String> {
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;
    if let Some(mut session) = sessions.remove(&session_id) {
        let _ = session.child.kill();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::drain_valid_utf8;

    // U+E7A8 (Nerd Font git branch icon) = 0xEE 0x9E 0xA8 in UTF-8.
    const GIT_BRANCH: &[u8] = &[0xEE, 0x9E, 0xA8];

    #[test]
    fn passes_through_valid_utf8() {
        let mut pending = b"hello world".to_vec();
        let out = drain_valid_utf8(&mut pending);
        assert_eq!(out, "hello world");
        assert!(pending.is_empty());
    }

    #[test]
    fn holds_back_incomplete_trailing_sequence() {
        // Read 1: "abc" + first 2 bytes of git-branch icon
        let mut pending = b"abc".to_vec();
        pending.extend_from_slice(&GIT_BRANCH[..2]);
        let out = drain_valid_utf8(&mut pending);
        assert_eq!(out, "abc");
        assert_eq!(pending, GIT_BRANCH[..2].to_vec());

        // Read 2: arrives with the missing 3rd byte + more text
        pending.push(GIT_BRANCH[2]);
        pending.extend_from_slice(b"xyz");
        let out = drain_valid_utf8(&mut pending);
        assert_eq!(out, "\u{e7a8}xyz");
        assert!(pending.is_empty());
    }

    #[test]
    fn replaces_genuine_invalid_byte_with_u_fffd() {
        // A standalone 0xFF is never valid UTF-8.
        let mut pending = vec![b'a', 0xFF, b'b'];
        let out = drain_valid_utf8(&mut pending);
        assert_eq!(out, "a\u{FFFD}b");
        assert!(pending.is_empty());
    }

    #[test]
    fn invalid_byte_followed_by_partial_sequence_is_held_back() {
        // Genuine invalid byte, then a chunk-boundary partial sequence.
        // The invalid byte should be replaced; the partial sequence held back.
        let mut pending = vec![b'a', 0xFF];
        pending.extend_from_slice(&GIT_BRANCH[..2]);
        let out = drain_valid_utf8(&mut pending);
        assert_eq!(out, "a\u{FFFD}");
        assert_eq!(pending, GIT_BRANCH[..2].to_vec());
    }
}
