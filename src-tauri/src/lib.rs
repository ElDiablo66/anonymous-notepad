pub mod bigfile;
pub mod files;
pub mod search;

use md5::Md5;
use sha1::Sha1;
use sha2::{Digest, Sha256, Sha512};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Manager};

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn digest(algorithm: &str, data: &[u8]) -> Result<String, String> {
    Ok(match algorithm {
        "md5" => hex(&Md5::digest(data)),
        "sha1" => hex(&Sha1::digest(data)),
        "sha256" => hex(&Sha256::digest(data)),
        "sha512" => hex(&Sha512::digest(data)),
        other => return Err(format!("Unknown hash: {other}")),
    })
}

#[derive(Serialize)]
struct FileHash {
    path: String,
    hash: Option<String>,
    error: Option<String>,
}

#[tauri::command]
fn hash_text(algorithm: String, text: String) -> Result<String, String> {
    digest(&algorithm, text.as_bytes())
}

#[tauri::command(async)]
fn hash_files(algorithm: String, paths: Vec<String>) -> Vec<FileHash> {
    paths
        .into_iter()
        .map(|path| match fs::read(&path).map_err(|e| e.to_string()).and_then(|b| digest(&algorithm, &b)) {
            Ok(hash) => FileHash { path, hash: Some(hash), error: None },
            Err(error) => FileHash { path, hash: None, error: Some(error) },
        })
        .collect()
}

fn store_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    if !matches!(name, "session" | "settings" | "session-backup") {
        return Err(format!("Unknown store: {name}"));
    }
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(format!("{name}.json")))
}

#[tauri::command]
fn store_load(app: AppHandle, name: String) -> Result<Option<String>, String> {
    let path = store_path(&app, &name)?;
    match fs::read_to_string(path) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn store_save(app: AppHandle, name: String, json: String) -> Result<(), String> {
    if name == "session-backup" {
        return Err("The backup is written by the app itself".into());
    }
    let path = store_path(&app, &name)?;
    write_keeping_backup(&path, &json, name == "session")
}

/// Writes through a temporary file so a crash cannot leave half a file. With
/// `backup`, the last readable version is first kept beside it as `<name>-backup.json`.
fn write_keeping_backup(path: &Path, json: &str, backup: bool) -> Result<(), String> {
    if backup {
        if let Ok(previous) = fs::read_to_string(path) {
            if serde_json::from_str::<serde_json::Value>(&previous).is_ok() {
                let stem = path.file_stem().unwrap_or_default().to_string_lossy();
                let _ = fs::write(path.with_file_name(format!("{stem}-backup.json")), previous);
            }
        }
    }
    let draft = path.with_extension("json.tmp");
    fs::write(&draft, json).map_err(|e| e.to_string())?;
    fs::rename(&draft, path).map_err(|e| e.to_string())
}

/// Picks the file paths out of a command line, resolving them against `cwd`.
fn file_args(args: &[String], cwd: &Path) -> Vec<String> {
    args.iter()
        .skip(1)
        .filter(|arg| !arg.starts_with('-'))
        .map(|arg| {
            let path = PathBuf::from(arg);
            if path.is_absolute() { path } else { cwd.join(path) }
        })
        .filter(|path| path.is_file())
        .map(|path| path.to_string_lossy().into_owned())
        .collect()
}

#[tauri::command]
fn startup_files() -> Vec<String> {
    let args: Vec<String> = std::env::args().collect();
    let cwd = std::env::current_dir().unwrap_or_default();
    file_args(&args, &cwd)
}

#[tauri::command]
fn open_terminal(dir: String, shell: String) -> Result<(), String> {
    let program = match shell.as_str() {
        "powershell" => "powershell",
        _ => "cmd",
    };
    if !Path::new(&dir).is_dir() {
        return Err(format!("{dir} is not a folder"));
    }
    std::process::Command::new("cmd")
        .args(["/c", "start", "", program])
        .current_dir(&dir)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Cannot open a terminal: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            let files = file_args(&args, Path::new(&cwd));
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            let _ = app.emit("open-files", files);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            files::read_file,
            files::write_file,
            files::stat_files,
            files::list_dir,
            files::rename_file,
            files::trash_file,
            search::find_in_files,
            bigfile::big_open,
            bigfile::big_read,
            bigfile::big_find,
            bigfile::big_close,
            hash_text,
            hash_files,
            store_load,
            store_save,
            startup_files,
            open_terminal,
        ])
        .run(tauri::generate_context!())
        .expect("Anonymous Notepad could not start");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_hashes() {
        assert_eq!(digest("md5", b"abc").unwrap(), "900150983cd24fb0d6963f7d28e17f72");
        assert_eq!(digest("sha1", b"abc").unwrap(), "a9993e364706816aba3e25717850c26c9cd0d89d");
        assert_eq!(
            digest("sha256", b"abc").unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert!(digest("sha512", b"abc").unwrap().starts_with("ddaf35a193617aba"));
        assert!(digest("crc", b"abc").is_err());
    }

    #[test]
    fn session_backup_keeps_the_last_good_copy() {
        let dir = std::env::temp_dir().join("anonymous-notepad-backup-test");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("session.json");
        let backup = dir.join("session-backup.json");

        write_keeping_backup(&path, r#"{"docs":[1]}"#, true).unwrap();
        assert!(!backup.exists());
        write_keeping_backup(&path, r#"{"docs":[2]}"#, true).unwrap();
        assert_eq!(fs::read_to_string(&backup).unwrap(), r#"{"docs":[1]}"#);

        // A damaged main file must not replace a good backup.
        fs::write(&path, "{broken").unwrap();
        write_keeping_backup(&path, r#"{"docs":[3]}"#, true).unwrap();
        assert_eq!(fs::read_to_string(&backup).unwrap(), r#"{"docs":[1]}"#);
        assert_eq!(fs::read_to_string(&path).unwrap(), r#"{"docs":[3]}"#);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn command_line_keeps_only_real_files() {
        let dir = std::env::temp_dir();
        let file = dir.join("anonymous-notepad-args-test.txt");
        fs::write(&file, "x").unwrap();
        let args = vec![
            "app.exe".to_string(),
            "--flag".to_string(),
            "anonymous-notepad-args-test.txt".to_string(),
            "missing-file.txt".to_string(),
        ];
        let found = file_args(&args, &dir);
        fs::remove_file(&file).unwrap();
        assert_eq!(found, vec![file.to_string_lossy().into_owned()]);
    }
}
