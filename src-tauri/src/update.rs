//! Updates from this app's GitHub releases. The newest release carries `latest.json`,
//! which names the version and the signed installer. An update is only installed when its
//! signature matches the public key built into the app.

use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use tauri_plugin_updater::{Update, UpdaterExt};

const FEED: &str = "https://github.com/ElDiablo66/anonymous-notepad/releases/latest/download/latest.json";

/// An update that was found and waits to be installed.
static FOUND: Mutex<Option<Update>> = Mutex::new(None);

#[derive(serde::Serialize)]
pub struct Found {
    pub version: String,
    pub notes: String,
}

#[tauri::command]
pub fn update_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

/// Asks GitHub whether a newer version is out. Gives its number and notes, or nothing.
#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<Option<Found>, String> {
    let feed = FEED.parse().map_err(|_| "The address for updates is not valid".to_string())?;
    let found = app
        .updater_builder()
        .endpoints(vec![feed])
        .map_err(|e| e.to_string())?
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;
    let told = found.as_ref().map(|update| Found {
        version: update.version.clone(),
        notes: update.body.clone().unwrap_or_default(),
    });
    *FOUND.lock().unwrap() = found;
    Ok(told)
}

/// Downloads the update that was found, checks its signature and runs the installer,
/// which closes the app and opens the new version.
#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<(), String> {
    // A copy, so a failed download leaves the update there for a second try.
    let Some(mut update) = FOUND.lock().unwrap().clone() else {
        return Err("No update is waiting. Look for one first.".into());
    };
    // The twenty seconds were for asking; the download takes as long as the line needs.
    update.timeout = None;
    let progress = app.clone();
    let mut got: u64 = 0;
    let bytes = update
        .download(
            move |chunk, total| {
                got += chunk as u64;
                let _ = progress.emit("update-progress", (got, total.unwrap_or(0)));
            },
            || {},
        )
        .await
        .map_err(|e| format!("The download failed: {e}"))?;
    update.install(bytes).map_err(|e| format!("The update could not be installed: {e}"))
}
