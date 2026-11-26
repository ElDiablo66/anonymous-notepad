//! Replace in files, in two steps. `replace_preview` works out every change without
//! touching the disk; `replace_apply` then rewrites only the files the user kept, and only
//! when each one is still exactly as it was when the preview read it.

use crate::files::{decode, encode};
use crate::search::{build_pattern, is_hidden, looks_binary, unescape_extended, Filters, FindOptions};
use ignore::{WalkBuilder, WalkState};
use regex::{NoExpand, Regex};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::borrow::Cow;
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Mutex;

const MAX_FILE_BYTES: u64 = 64 * 1024 * 1024;
/// Lines shown per file in the preview; the count still covers every match.
const SHOWN_PER_FILE: usize = 40;
const MAX_FILES: usize = 2000;
const MAX_LINE_CHARS: usize = 300;

#[derive(Serialize, Debug, Clone)]
pub struct LineChange {
    pub line: usize,
    pub before: String,
    pub after: String,
}

#[derive(Serialize, Debug, Clone)]
pub struct FileChange {
    pub path: String,
    /// SHA-256 of the file as the preview read it.
    pub fingerprint: String,
    pub count: usize,
    pub encoding: String,
    pub lines: Vec<LineChange>,
}

#[derive(Serialize, Debug)]
pub struct ReplacePlan {
    pub files: Vec<FileChange>,
    pub files_searched: usize,
    pub total: usize,
    /// True when more than MAX_FILES files would change; only the listed ones can be applied.
    pub truncated: bool,
}

#[derive(Deserialize)]
pub struct Chosen {
    pub path: String,
    pub fingerprint: String,
}

#[derive(Serialize, Debug)]
pub struct Applied {
    pub path: String,
    pub count: usize,
    pub error: Option<String>,
}

/// The text that goes in place of a match. Regular expressions may refer to groups as
/// `$1` or `\1`; the other modes put the text in as it is.
pub struct Replacement {
    template: String,
    expand: bool,
}

impl Replacement {
    pub fn new(replace: &str, mode: &str) -> Self {
        match mode {
            "regex" => {
                let unescaped = unescape_extended(replace);
                let mut template = String::with_capacity(unescaped.len());
                let chars: Vec<char> = unescaped.chars().collect();
                let mut i = 0;
                while i < chars.len() {
                    if chars[i] == '\\' && i + 1 < chars.len() && chars[i + 1].is_ascii_digit() {
                        template.push_str(&format!("${{{}}}", chars[i + 1]));
                        i += 2;
                    } else {
                        template.push(chars[i]);
                        i += 1;
                    }
                }
                Replacement { template, expand: true }
            }
            "extended" => Replacement { template: unescape_extended(replace), expand: false },
            _ => Replacement { template: replace.to_string(), expand: false },
        }
    }

    pub fn apply<'t>(&self, pattern: &Regex, text: &'t str) -> Cow<'t, str> {
        if self.expand {
            pattern.replace_all(text, self.template.as_str())
        } else {
            pattern.replace_all(text, NoExpand(&self.template))
        }
    }
}

fn fingerprint(bytes: &[u8]) -> String {
    Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
}

fn shorten(line: &str) -> String {
    if line.chars().count() <= MAX_LINE_CHARS {
        line.to_string()
    } else {
        line.chars().take(MAX_LINE_CHARS).collect::<String>() + "…"
    }
}

/// Reads a file the way replace needs it: text, encoding, and proof that writing the text
/// back unchanged gives the same bytes. Files that would not round-trip are left alone.
fn read_for_replace(path: &Path) -> Result<(Vec<u8>, String, String, bool), String> {
    let bytes = fs::read(path).map_err(|e| format!("Cannot read: {e}"))?;
    if looks_binary(&bytes) {
        return Err("Looks like a binary file".into());
    }
    let decoded = decode(&bytes, None)?;
    let again = encode(&decoded.text, &decoded.encoding, decoded.bom)?;
    if again != bytes {
        return Err(format!("Skipped: reading and writing it as {} would change other bytes", decoded.encoding));
    }
    Ok((bytes, decoded.text, decoded.encoding, decoded.bom))
}

/// What replacing would do to one file, or None when nothing in it matches.
pub fn plan_file(pattern: &Regex, replacement: &Replacement, path: &Path) -> Option<FileChange> {
    let (bytes, text, encoding, _) = read_for_replace(path).ok()?;
    if !pattern.is_match(&text) {
        return None;
    }
    let count = pattern.find_iter(&text).filter(|m| !m.is_empty()).count();
    if count == 0 {
        return None;
    }
    let mut lines = Vec::new();
    for (index, raw) in text.split('\n').enumerate() {
        if lines.len() >= SHOWN_PER_FILE {
            break;
        }
        let line = raw.strip_suffix('\r').unwrap_or(raw);
        if !pattern.is_match(line) {
            continue;
        }
        let after = replacement.apply(pattern, line);
        if after != line {
            lines.push(LineChange { line: index + 1, before: shorten(line), after: shorten(&after) });
        }
    }
    Some(FileChange {
        path: path.to_string_lossy().into_owned(),
        fingerprint: fingerprint(&bytes),
        count,
        encoding,
        lines,
    })
}

pub fn preview(options: &FindOptions, replace: &str, threads: usize) -> Result<ReplacePlan, String> {
    if options.what.is_empty() {
        return Err("Type something to search for".into());
    }
    let pattern = build_pattern(&options.what, &options.mode, options.match_case, options.whole_word)?;
    let replacement = Replacement::new(replace, &options.mode);
    let filters = Filters::parse(&options.filters);
    let show_hidden = options.hidden;
    let files: Mutex<Vec<FileChange>> = Mutex::new(Vec::new());
    let searched = AtomicUsize::new(0);
    let full = AtomicBool::new(false);

    let mut walker = WalkBuilder::new(&options.dir);
    walker
        .standard_filters(false)
        .follow_links(false)
        .threads(threads)
        .max_depth(if options.subfolders { None } else { Some(1) })
        .filter_entry(move |entry| show_hidden || !is_hidden(entry.path(), entry.depth()));
    walker.build_parallel().run(|| {
        Box::new(|entry| {
            if full.load(Ordering::Relaxed) {
                return WalkState::Quit;
            }
            let Ok(entry) = entry else { return WalkState::Continue };
            if !entry.file_type().is_some_and(|kind| kind.is_file()) || !filters.accepts(&entry.file_name().to_string_lossy()) {
                return WalkState::Continue;
            }
            if entry.metadata().map(|meta| meta.len() > MAX_FILE_BYTES).unwrap_or(true) {
                return WalkState::Continue;
            }
            searched.fetch_add(1, Ordering::Relaxed);
            if let Some(change) = plan_file(&pattern, &replacement, entry.path()) {
                let mut list = files.lock().unwrap();
                list.push(change);
                if list.len() > MAX_FILES {
                    full.store(true, Ordering::Relaxed);
                    return WalkState::Quit;
                }
            }
            WalkState::Continue
        })
    });

    let mut files = files.into_inner().unwrap();
    files.sort_by(|a, b| a.path.cmp(&b.path));
    let truncated = files.len() > MAX_FILES;
    files.truncate(MAX_FILES);
    let total = files.iter().map(|file| file.count).sum();
    Ok(ReplacePlan { files, files_searched: searched.into_inner(), total, truncated })
}

/// Writes through a temporary file in the same folder, so a crash cannot leave half a file.
fn write_safely(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut draft = path.as_os_str().to_owned();
    draft.push(".anonymous-notepad-tmp");
    let draft = std::path::PathBuf::from(draft);
    fs::write(&draft, bytes).map_err(|e| format!("Cannot write: {e}"))?;
    fs::rename(&draft, path).map_err(|e| {
        let _ = fs::remove_file(&draft);
        format!("Cannot replace the file: {e}")
    })
}

pub fn apply_file(pattern: &Regex, replacement: &Replacement, chosen: &Chosen) -> Applied {
    let path = Path::new(&chosen.path);
    let result = (|| {
        if fs::metadata(path).map_err(|e| e.to_string())?.permissions().readonly() {
            return Err("The file is read-only".to_string());
        }
        let (bytes, text, encoding, bom) = read_for_replace(path)?;
        if fingerprint(&bytes) != chosen.fingerprint {
            return Err("Changed since the preview, so it was left alone. Preview again.".into());
        }
        let count = pattern.find_iter(&text).filter(|m| !m.is_empty()).count();
        let replaced = replacement.apply(pattern, &text);
        if count == 0 || replaced == text {
            return Ok(0);
        }
        let out = encode(&replaced, &encoding, bom).map_err(|e| e.replace("UNMAPPABLE: ", ""))?;
        write_safely(path, &out)?;
        Ok(count)
    })();
    match result {
        Ok(count) => Applied { path: chosen.path.clone(), count, error: None },
        Err(error) => Applied { path: chosen.path.clone(), count: 0, error: Some(error) },
    }
}

#[tauri::command(async)]
pub fn replace_preview(options: FindOptions, replace: String) -> Result<ReplacePlan, String> {
    preview(&options, &replace, 0)
}

#[tauri::command(async)]
pub fn replace_apply(options: FindOptions, replace: String, files: Vec<Chosen>) -> Result<Vec<Applied>, String> {
    let pattern = build_pattern(&options.what, &options.mode, options.match_case, options.whole_word)?;
    let replacement = Replacement::new(&replace, &options.mode);
    Ok(files.iter().map(|chosen| apply_file(&pattern, &replacement, chosen)).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn options(dir: &Path, what: &str, mode: &str) -> FindOptions {
        FindOptions {
            dir: dir.to_string_lossy().into_owned(),
            what: what.into(),
            mode: mode.into(),
            match_case: true,
            whole_word: false,
            filters: String::new(),
            subfolders: true,
            hidden: false,
            max_hits: 1000,
        }
    }

    fn folder(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("anonymous-notepad-replace-{name}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("sub")).unwrap();
        dir
    }

    #[test]
    fn replacement_templates() {
        let pattern = build_pattern(r"(\w+)@(\w+)", "regex", true, false).unwrap();
        assert_eq!(Replacement::new(r"\2 at \1", "regex").apply(&pattern, "me@home"), "home at me");
        assert_eq!(Replacement::new("$2/$1", "regex").apply(&pattern, "me@home"), "home/me");
        let literal = build_pattern("a.b", "normal", true, false).unwrap();
        assert_eq!(Replacement::new("$1", "normal").apply(&literal, "a.b axb"), "$1 axb");
        let extended = build_pattern(", ", "normal", true, false).unwrap();
        assert_eq!(Replacement::new(r"\n", "extended").apply(&extended, "a, b"), "a\nb");
    }

    #[test]
    fn preview_then_apply_keeps_encodings_and_line_endings() {
        let dir = folder("roundtrip");
        fs::write(dir.join("a.txt"), "neon one\r\nplain\r\nneon two\r\n").unwrap();
        fs::write(dir.join("sub").join("b.md"), "\u{feff}a neon sign\n").unwrap();
        fs::write(dir.join("c.txt"), encode("néon? neon café", "windows-1252", false).unwrap()).unwrap();
        fs::write(dir.join("d.txt"), "nothing here").unwrap();
        fs::write(dir.join("e.bin"), [b'n', b'e', b'o', b'n', 0, 1]).unwrap();

        let opts = options(&dir, "neon", "normal");
        let plan = preview(&opts, "glow", 0).unwrap();
        let names: Vec<_> = plan.files.iter().map(|f| Path::new(&f.path).file_name().unwrap().to_string_lossy().into_owned()).collect();
        assert_eq!(names, ["a.txt", "c.txt", "b.md"]);
        assert_eq!(plan.total, 4);
        assert_eq!(plan.files[0].lines[1].line, 3);
        assert_eq!(plan.files[0].lines[1].after, "glow two");
        // The preview wrote nothing.
        assert_eq!(fs::read_to_string(dir.join("a.txt")).unwrap(), "neon one\r\nplain\r\nneon two\r\n");

        let pattern = build_pattern("neon", "normal", true, false).unwrap();
        let replacement = Replacement::new("glow", "normal");
        for file in &plan.files {
            let done = apply_file(&pattern, &replacement, &Chosen { path: file.path.clone(), fingerprint: file.fingerprint.clone() });
            assert_eq!(done.error, None, "{}", file.path);
            assert_eq!(done.count, file.count);
        }
        assert_eq!(fs::read_to_string(dir.join("a.txt")).unwrap(), "glow one\r\nplain\r\nglow two\r\n");
        assert_eq!(fs::read(dir.join("sub").join("b.md")).unwrap(), "\u{feff}a glow sign\n".as_bytes());
        assert_eq!(fs::read(dir.join("c.txt")).unwrap(), encode("néon? glow café", "windows-1252", false).unwrap());
        assert_eq!(fs::read_to_string(dir.join("d.txt")).unwrap(), "nothing here");
        assert!(!dir.join("a.txt.anonymous-notepad-tmp").exists());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn a_file_changed_after_the_preview_is_left_alone() {
        let dir = folder("changed");
        let path = dir.join("a.txt");
        fs::write(&path, "neon").unwrap();
        let plan = preview(&options(&dir, "neon", "normal"), "glow", 1).unwrap();
        fs::write(&path, "neon, edited by someone else").unwrap();
        let pattern = build_pattern("neon", "normal", true, false).unwrap();
        let done = apply_file(&pattern, &Replacement::new("glow", "normal"), &Chosen { path: plan.files[0].path.clone(), fingerprint: plan.files[0].fingerprint.clone() });
        assert!(done.error.unwrap().contains("Changed since the preview"));
        assert_eq!(fs::read_to_string(&path).unwrap(), "neon, edited by someone else");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn read_only_files_are_refused() {
        let dir = folder("readonly");
        let path = dir.join("a.txt");
        fs::write(&path, "neon").unwrap();
        let plan = preview(&options(&dir, "neon", "normal"), "glow", 1).unwrap();
        let mut permissions = fs::metadata(&path).unwrap().permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&path, permissions.clone()).unwrap();
        let pattern = build_pattern("neon", "normal", true, false).unwrap();
        let done = apply_file(&pattern, &Replacement::new("glow", "normal"), &Chosen { path: plan.files[0].path.clone(), fingerprint: plan.files[0].fingerprint.clone() });
        assert!(done.error.unwrap().contains("read-only"));
        #[allow(clippy::permissions_set_readonly_false)]
        permissions.set_readonly(false);
        fs::set_permissions(&path, permissions).unwrap();
        fs::remove_dir_all(&dir).unwrap();
    }
}
