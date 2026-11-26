//! Reading and writing text files in whatever encoding they use.

use encoding_rs::Encoding;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

/// Files above this size are refused; the editor keeps the whole text in memory.
const MAX_FILE_BYTES: u64 = 256 * 1024 * 1024;

#[derive(Serialize)]
pub struct FileData {
    pub path: String,
    pub name: String,
    pub text: String,
    pub encoding: String,
    pub bom: bool,
    pub eol: String,
    pub mtime: Option<f64>,
    pub read_only: bool,
}

#[derive(Serialize)]
pub struct FileStat {
    pub mtime: Option<f64>,
    pub size: u64,
}

#[derive(Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

pub struct Decoded {
    pub text: String,
    pub encoding: String,
    pub bom: bool,
}

fn decode_utf16(bytes: &[u8], little_endian: bool) -> String {
    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|pair| {
            if little_endian {
                u16::from_le_bytes([pair[0], pair[1]])
            } else {
                u16::from_be_bytes([pair[0], pair[1]])
            }
        })
        .collect();
    String::from_utf16_lossy(&units)
}

/// Turns raw bytes into text. A byte order mark wins, then valid UTF-8,
/// then a guess from the byte patterns. `forced` skips the guessing.
pub fn decode(bytes: &[u8], forced: Option<&str>) -> Result<Decoded, String> {
    if let Some(label) = forced {
        let upper = label.to_ascii_uppercase();
        if upper == "UTF-16LE" || upper == "UTF-16BE" {
            let little = upper == "UTF-16LE";
            let mark: [u8; 2] = if little { [0xFF, 0xFE] } else { [0xFE, 0xFF] };
            let had_mark = bytes.starts_with(&mark);
            let body = if had_mark { &bytes[2..] } else { bytes };
            return Ok(Decoded { text: decode_utf16(body, little), encoding: upper, bom: true });
        }
        let encoding = Encoding::for_label(label.as_bytes())
            .ok_or_else(|| format!("Unknown encoding: {label}"))?;
        let had_mark = encoding == encoding_rs::UTF_8 && bytes.starts_with(&[0xEF, 0xBB, 0xBF]);
        let body = if had_mark { &bytes[3..] } else { bytes };
        let (text, _) = encoding.decode_without_bom_handling(body);
        return Ok(Decoded { text: text.into_owned(), encoding: encoding.name().to_string(), bom: had_mark });
    }

    if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        let text = String::from_utf8_lossy(&bytes[3..]).into_owned();
        return Ok(Decoded { text, encoding: "UTF-8".into(), bom: true });
    }
    if bytes.starts_with(&[0xFF, 0xFE]) {
        return Ok(Decoded { text: decode_utf16(&bytes[2..], true), encoding: "UTF-16LE".into(), bom: true });
    }
    if bytes.starts_with(&[0xFE, 0xFF]) {
        return Ok(Decoded { text: decode_utf16(&bytes[2..], false), encoding: "UTF-16BE".into(), bom: true });
    }
    if let Ok(text) = std::str::from_utf8(bytes) {
        return Ok(Decoded { text: text.to_string(), encoding: "UTF-8".into(), bom: false });
    }

    let mut detector = chardetng::EncodingDetector::new();
    detector.feed(bytes, true);
    let encoding = detector.guess(None, false);
    let (text, _) = encoding.decode_without_bom_handling(bytes);
    Ok(Decoded { text: text.into_owned(), encoding: encoding.name().to_string(), bom: false })
}

/// Turns text back into bytes. Fails when the encoding cannot hold a character,
/// so the caller can offer UTF-8 instead of saving question marks.
pub fn encode(text: &str, encoding: &str, bom: bool) -> Result<Vec<u8>, String> {
    let upper = encoding.to_ascii_uppercase();
    if upper == "UTF-8" {
        let mut out = Vec::with_capacity(text.len() + 3);
        if bom {
            out.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
        }
        out.extend_from_slice(text.as_bytes());
        return Ok(out);
    }
    if upper == "UTF-16LE" || upper == "UTF-16BE" {
        let little = upper == "UTF-16LE";
        let mut out = Vec::with_capacity(text.len() * 2 + 2);
        out.extend_from_slice(if little { &[0xFF, 0xFE] } else { &[0xFE, 0xFF] });
        for unit in text.encode_utf16() {
            out.extend_from_slice(&if little { unit.to_le_bytes() } else { unit.to_be_bytes() });
        }
        return Ok(out);
    }
    let target = Encoding::for_label(encoding.as_bytes())
        .ok_or_else(|| format!("Unknown encoding: {encoding}"))?;
    let (bytes, _, unmappable) = target.encode(text);
    if unmappable {
        return Err(format!("UNMAPPABLE: {} cannot store some characters in this text", target.name()));
    }
    Ok(bytes.into_owned())
}

/// The line ending most lines use. An empty or single-line file gets CRLF, the Windows default.
pub fn detect_eol(text: &str) -> &'static str {
    let bytes = text.as_bytes();
    let (mut crlf, mut lf, mut cr) = (0usize, 0usize, 0usize);
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'\r' if bytes.get(i + 1) == Some(&b'\n') => {
                crlf += 1;
                i += 1;
            }
            b'\r' => cr += 1,
            b'\n' => lf += 1,
            _ => {}
        }
        i += 1;
    }
    if lf > crlf && lf >= cr {
        "LF"
    } else if cr > crlf && cr > lf {
        "CR"
    } else {
        "CRLF"
    }
}

fn mtime_of(path: &Path) -> Option<f64> {
    let modified = fs::metadata(path).ok()?.modified().ok()?;
    Some(modified.duration_since(UNIX_EPOCH).ok()?.as_secs_f64() * 1000.0)
}

fn file_name(path: &Path) -> String {
    path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
}

fn load(path: &str, forced: Option<&str>) -> Result<FileData, String> {
    let target = PathBuf::from(path);
    let meta = fs::metadata(&target).map_err(|e| format!("Cannot open {path}: {e}"))?;
    if meta.is_dir() {
        return Err(format!("{path} is a folder"));
    }
    if meta.len() > MAX_FILE_BYTES {
        return Err(format!("{path} is larger than 256 MB and was not opened"));
    }
    let bytes = fs::read(&target).map_err(|e| format!("Cannot read {path}: {e}"))?;
    let decoded = decode(&bytes, forced)?;
    let eol = detect_eol(&decoded.text).to_string();
    Ok(FileData {
        path: path.to_string(),
        name: file_name(&target),
        text: decoded.text,
        encoding: decoded.encoding,
        bom: decoded.bom,
        eol,
        mtime: mtime_of(&target),
        read_only: meta.permissions().readonly(),
    })
}

#[tauri::command(async)]
pub fn read_file(path: String, encoding: Option<String>) -> Result<FileData, String> {
    load(&path, encoding.as_deref())
}

#[tauri::command(async)]
pub fn write_file(path: String, text: String, encoding: String, bom: bool) -> Result<Option<f64>, String> {
    let bytes = encode(&text, &encoding, bom)?;
    fs::write(&path, bytes).map_err(|e| format!("Cannot save {path}: {e}"))?;
    Ok(mtime_of(Path::new(&path)))
}

#[tauri::command]
pub fn stat_files(paths: Vec<String>) -> Vec<Option<FileStat>> {
    paths
        .iter()
        .map(|p| {
            let meta = fs::metadata(p).ok()?;
            Some(FileStat { mtime: mtime_of(Path::new(p)), size: meta.len() })
        })
        .collect()
}

#[tauri::command(async)]
pub fn list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let mut entries: Vec<DirEntry> = fs::read_dir(&path)
        .map_err(|e| format!("Cannot list {path}: {e}"))?
        .filter_map(|entry| entry.ok())
        .map(|entry| {
            let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            DirEntry {
                name: entry.file_name().to_string_lossy().into_owned(),
                path: entry.path().to_string_lossy().into_owned(),
                is_dir,
            }
        })
        .collect();
    entries.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

#[tauri::command]
pub fn rename_file(path: String, new_name: String) -> Result<String, String> {
    if new_name.is_empty() || new_name.contains(['/', '\\']) {
        return Err("A file name cannot be empty or contain slashes".into());
    }
    let from = PathBuf::from(&path);
    let to = from.with_file_name(&new_name);
    if to.exists() {
        return Err(format!("{new_name} already exists in this folder"));
    }
    fs::rename(&from, &to).map_err(|e| format!("Cannot rename: {e}"))?;
    Ok(to.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn trash_file(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|e| format!("Cannot move to the Recycle Bin: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utf8_round_trip_with_and_without_mark() {
        let text = "naïve café 日本語";
        let plain = encode(text, "UTF-8", false).unwrap();
        let decoded = decode(&plain, None).unwrap();
        assert_eq!((decoded.text.as_str(), decoded.encoding.as_str(), decoded.bom), (text, "UTF-8", false));

        let marked = encode(text, "UTF-8", true).unwrap();
        assert_eq!(&marked[..3], &[0xEF, 0xBB, 0xBF]);
        let decoded = decode(&marked, None).unwrap();
        assert_eq!((decoded.text.as_str(), decoded.bom), (text, true));
    }

    #[test]
    fn utf16_round_trip_both_byte_orders() {
        let text = "line one\r\nsecond 😀";
        for name in ["UTF-16LE", "UTF-16BE"] {
            let bytes = encode(text, name, true).unwrap();
            let decoded = decode(&bytes, None).unwrap();
            assert_eq!(decoded.text, text);
            assert_eq!(decoded.encoding, name);
        }
    }

    #[test]
    fn legacy_bytes_are_guessed_and_kept() {
        let bytes = encode("déjà vu, señor", "windows-1252", false).unwrap();
        assert!(std::str::from_utf8(&bytes).is_err());
        let decoded = decode(&bytes, None).unwrap();
        assert_eq!(decoded.text, "déjà vu, señor");
        assert_eq!(encode(&decoded.text, &decoded.encoding, false).unwrap(), bytes);
    }

    #[test]
    fn unmappable_characters_are_refused() {
        let error = encode("日本", "windows-1252", false).unwrap_err();
        assert!(error.starts_with("UNMAPPABLE"));
    }

    #[test]
    fn forced_encoding_overrides_the_guess() {
        let bytes = encode("Привет", "windows-1251", false).unwrap();
        let decoded = decode(&bytes, Some("windows-1251")).unwrap();
        assert_eq!(decoded.text, "Привет");
    }

    #[test]
    fn line_endings_are_counted() {
        assert_eq!(detect_eol("a\r\nb\r\nc\n"), "CRLF");
        assert_eq!(detect_eol("a\nb\nc\r\n"), "LF");
        assert_eq!(detect_eol("a\rb\rc"), "CR");
        assert_eq!(detect_eol("no breaks"), "CRLF");
    }
}
