//! Find in files: walks a folder on every processor core and reports each matching line.

use crate::files::decode;
use ignore::{WalkBuilder, WalkState};
use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Mutex;

const MAX_SEARCH_BYTES: u64 = 64 * 1024 * 1024;
const MAX_LINE_CHARS: usize = 400;

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FindOptions {
    pub dir: String,
    pub what: String,
    /// "normal", "extended" or "regex"
    pub mode: String,
    pub match_case: bool,
    pub whole_word: bool,
    /// Patterns such as "*.txt;*.md"; a leading "!" excludes.
    pub filters: String,
    pub subfolders: bool,
    pub hidden: bool,
    pub max_hits: usize,
}

#[derive(Serialize, Debug)]
pub struct Hit {
    pub path: String,
    pub line: usize,
    /// Column and length in UTF-16 units, the way the editor counts.
    pub col: usize,
    pub len: usize,
    pub text: String,
}

#[derive(Serialize)]
pub struct FindResult {
    pub hits: Vec<Hit>,
    pub files_searched: usize,
    pub files_with_hits: usize,
    pub truncated: bool,
}

/// Expands \n, \r, \t, \0, \\, \xHH and \uHHHH.
pub fn unescape_extended(input: &str) -> String {
    let chars: Vec<char> = input.chars().collect();
    let mut out = String::with_capacity(input.len());
    let mut i = 0;
    while i < chars.len() {
        if chars[i] != '\\' || i + 1 >= chars.len() {
            out.push(chars[i]);
            i += 1;
            continue;
        }
        let hex = |count: usize| -> Option<char> {
            let digits: String = chars.get(i + 2..i + 2 + count)?.iter().collect();
            char::from_u32(u32::from_str_radix(&digits, 16).ok()?)
        };
        match chars[i + 1] {
            'n' => out.push('\n'),
            'r' => out.push('\r'),
            't' => out.push('\t'),
            '0' => out.push('\0'),
            '\\' => out.push('\\'),
            'x' => {
                if let Some(c) = hex(2) {
                    out.push(c);
                    i += 4;
                    continue;
                }
                out.push_str("\\x");
            }
            'u' => {
                if let Some(c) = hex(4) {
                    out.push(c);
                    i += 6;
                    continue;
                }
                out.push_str("\\u");
            }
            other => {
                out.push('\\');
                out.push(other);
            }
        }
        i += 2;
    }
    out
}

pub fn build_pattern(what: &str, mode: &str, match_case: bool, whole_word: bool) -> Result<Regex, String> {
    let mut source = match mode {
        "regex" => what.to_string(),
        "extended" => regex::escape(&unescape_extended(what)),
        _ => regex::escape(what),
    };
    if whole_word {
        source = format!(r"\b(?:{source})\b");
    }
    RegexBuilder::new(&source)
        .case_insensitive(!match_case)
        .multi_line(true)
        // `$` also matches before a CR, so Windows line endings behave like Unix ones.
        .crlf(true)
        .build()
        .map_err(|e| format!("The search pattern is not valid: {e}"))
}

/// Matches a file name against one wildcard pattern (`*` and `?`), ignoring case.
pub fn wildcard_match(pattern: &str, name: &str) -> bool {
    let p: Vec<char> = pattern.to_lowercase().chars().collect();
    let n: Vec<char> = name.to_lowercase().chars().collect();
    let (mut pi, mut ni) = (0usize, 0usize);
    let (mut star, mut mark) = (None, 0usize);
    while ni < n.len() {
        if pi < p.len() && (p[pi] == '?' || p[pi] == n[ni]) {
            pi += 1;
            ni += 1;
        } else if pi < p.len() && p[pi] == '*' {
            star = Some(pi);
            mark = ni;
            pi += 1;
        } else if let Some(s) = star {
            pi = s + 1;
            mark += 1;
            ni = mark;
        } else {
            return false;
        }
    }
    while pi < p.len() && p[pi] == '*' {
        pi += 1;
    }
    pi == p.len()
}

pub struct Filters {
    include: Vec<String>,
    exclude: Vec<String>,
}

impl Filters {
    pub fn parse(spec: &str) -> Self {
        let mut include = Vec::new();
        let mut exclude = Vec::new();
        for part in spec.split([';', ',', ' ']).map(str::trim).filter(|p| !p.is_empty()) {
            match part.strip_prefix('!') {
                Some(rest) if !rest.is_empty() => exclude.push(rest.to_string()),
                Some(_) => {}
                None => include.push(part.to_string()),
            }
        }
        Filters { include, exclude }
    }

    pub fn accepts(&self, name: &str) -> bool {
        if self.exclude.iter().any(|p| wildcard_match(p, name)) {
            return false;
        }
        self.include.is_empty() || self.include.iter().any(|p| wildcard_match(p, name))
    }
}

pub fn is_hidden(path: &Path, depth: usize) -> bool {
    if depth == 0 {
        return false;
    }
    if path.file_name().is_some_and(|name| name.to_string_lossy().starts_with('.')) {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if let Ok(meta) = fs::metadata(path) {
            return meta.file_attributes() & 0x2 != 0;
        }
    }
    false
}

fn has_utf16_mark(bytes: &[u8]) -> bool {
    bytes.starts_with(&[0xFF, 0xFE]) || bytes.starts_with(&[0xFE, 0xFF])
}

pub fn looks_binary(bytes: &[u8]) -> bool {
    !has_utf16_mark(bytes) && bytes.iter().take(8192).any(|&b| b == 0)
}

fn shorten(line: &str) -> String {
    if line.chars().count() <= MAX_LINE_CHARS {
        line.to_string()
    } else {
        line.chars().take(MAX_LINE_CHARS).collect::<String>() + "…"
    }
}

/// Adds every match in `text` to `hits`, up to `room` of them. Returns true when the text matched at all.
pub fn search_text(pattern: &Regex, path: &str, text: &str, hits: &mut Vec<Hit>, room: usize) -> bool {
    // One pass over the whole text first: most files do not match, and those never get split into lines.
    if !pattern.is_match(text) {
        return false;
    }
    let mut found = false;
    for (index, raw) in text.split('\n').enumerate() {
        let line = raw.strip_suffix('\r').unwrap_or(raw);
        for m in pattern.find_iter(line) {
            if m.start() == m.end() {
                continue;
            }
            found = true;
            if hits.len() >= room {
                return found;
            }
            hits.push(Hit {
                path: path.to_string(),
                line: index + 1,
                col: line[..m.start()].encode_utf16().count(),
                len: m.as_str().encode_utf16().count(),
                text: shorten(line),
            });
        }
    }
    found
}

/// Searches one file. Plain UTF-8, the usual case, is searched in place without copying.
fn search_file(pattern: &Regex, path: &Path, room: usize) -> Option<Vec<Hit>> {
    let bytes = fs::read(path).ok()?;
    if looks_binary(&bytes) {
        return None;
    }
    let shown = path.to_string_lossy();
    let mut hits = Vec::new();
    let body = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(&bytes);
    match std::str::from_utf8(body) {
        Ok(text) if !has_utf16_mark(&bytes) => {
            search_text(pattern, &shown, text, &mut hits, room);
        }
        _ => {
            let decoded = decode(&bytes, None).ok()?;
            search_text(pattern, &shown, &decoded.text, &mut hits, room);
        }
    }
    Some(hits)
}

/// The search itself. `threads` of 0 lets the walker use every core.
pub fn find(options: &FindOptions, threads: usize) -> Result<FindResult, String> {
    if options.what.is_empty() {
        return Err("Type something to search for".into());
    }
    let pattern = build_pattern(&options.what, &options.mode, options.match_case, options.whole_word)?;
    let filters = Filters::parse(&options.filters);
    let max_hits = options.max_hits.clamp(1, 100_000);
    let show_hidden = options.hidden;

    let hits: Mutex<Vec<Hit>> = Mutex::new(Vec::new());
    let found = AtomicUsize::new(0);
    let files_searched = AtomicUsize::new(0);
    let files_with_hits = AtomicUsize::new(0);
    let full = AtomicBool::new(false);

    // Version-control ignore files are not applied: a text editor's search looks at everything it is pointed at.
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
            if !entry.file_type().is_some_and(|kind| kind.is_file()) {
                return WalkState::Continue;
            }
            if !filters.accepts(&entry.file_name().to_string_lossy()) {
                return WalkState::Continue;
            }
            if entry.metadata().map(|meta| meta.len() > MAX_SEARCH_BYTES).unwrap_or(true) {
                return WalkState::Continue;
            }
            let room = max_hits.saturating_sub(found.load(Ordering::Relaxed));
            let Some(file_hits) = search_file(&pattern, entry.path(), room.max(1)) else {
                return WalkState::Continue;
            };
            files_searched.fetch_add(1, Ordering::Relaxed);
            if !file_hits.is_empty() {
                files_with_hits.fetch_add(1, Ordering::Relaxed);
                let total = found.fetch_add(file_hits.len(), Ordering::Relaxed) + file_hits.len();
                hits.lock().unwrap().extend(file_hits);
                if total >= max_hits {
                    full.store(true, Ordering::Relaxed);
                    return WalkState::Quit;
                }
            }
            WalkState::Continue
        })
    });

    // The cores finish in no particular order; the list is shown by file, then line.
    let mut hits = hits.into_inner().unwrap();
    hits.sort_by(|a, b| a.path.cmp(&b.path).then(a.line.cmp(&b.line)).then(a.col.cmp(&b.col)));
    let truncated = hits.len() >= max_hits;
    hits.truncate(max_hits);
    Ok(FindResult {
        hits,
        files_searched: files_searched.into_inner(),
        files_with_hits: files_with_hits.into_inner(),
        truncated,
    })
}

#[tauri::command(async)]
pub fn find_in_files(options: FindOptions) -> Result<FindResult, String> {
    find(&options, 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extended_escapes_expand() {
        assert_eq!(unescape_extended(r"a\tb\nc"), "a\tb\nc");
        assert_eq!(unescape_extended(r"\x41é\\"), "Aé\\");
        assert_eq!(unescape_extended(r"\q\xZZ"), r"\q\xZZ");
    }

    #[test]
    fn wildcards_match_file_names() {
        assert!(wildcard_match("*.txt", "Notes.TXT"));
        assert!(wildcard_match("log-??.md", "log-07.md"));
        assert!(!wildcard_match("*.txt", "notes.txt.bak"));
        assert!(wildcard_match("*", "anything"));
    }

    #[test]
    fn filters_include_and_exclude() {
        let filters = Filters::parse("*.rs; *.toml !Cargo.lock !*.min.*");
        assert!(filters.accepts("main.rs"));
        assert!(filters.accepts("Cargo.toml"));
        assert!(!filters.accepts("readme.md"));
        let all = Filters::parse("!*.log");
        assert!(all.accepts("a.txt"));
        assert!(!all.accepts("run.log"));
    }

    #[test]
    fn hits_carry_line_and_utf16_column() {
        let pattern = build_pattern("sun", "normal", false, true).unwrap();
        let mut hits = Vec::new();
        let text = "the Sun sets\r\nsunset is not a word match\n😀 sun";
        assert!(search_text(&pattern, "a.txt", text, &mut hits, 100));
        assert_eq!(hits.len(), 2);
        assert_eq!((hits[0].line, hits[0].col, hits[0].len), (1, 4, 3));
        assert_eq!((hits[1].line, hits[1].col), (3, 3));
        assert_eq!(hits[0].text, "the Sun sets");
    }

    #[test]
    fn regex_mode_and_case() {
        let pattern = build_pattern(r"\d{3}", "regex", true, false).unwrap();
        let mut hits = Vec::new();
        search_text(&pattern, "a", "id 123 and 4567", &mut hits, 100);
        assert_eq!(hits.len(), 2);
        assert!(build_pattern("(", "regex", true, false).is_err());
        assert!(build_pattern("(", "normal", true, false).is_ok());
    }

    #[test]
    fn hit_limit_stops_the_search() {
        let pattern = build_pattern("a", "normal", true, false).unwrap();
        let mut hits = Vec::new();
        search_text(&pattern, "a", "aaaa\naaaa", &mut hits, 5);
        assert_eq!(hits.len(), 5);
    }

    fn options(dir: &Path, what: &str) -> FindOptions {
        FindOptions {
            dir: dir.to_string_lossy().into_owned(),
            what: what.into(),
            mode: "normal".into(),
            match_case: false,
            whole_word: false,
            filters: String::new(),
            subfolders: true,
            hidden: false,
            max_hits: 1000,
        }
    }

    #[test]
    fn folder_search_finds_every_encoding_in_order() {
        let dir = std::env::temp_dir().join("anonymous-notepad-find-test");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("sub")).unwrap();
        fs::create_dir_all(dir.join(".secret")).unwrap();
        fs::write(dir.join("a.txt"), "neon one\nplain\nNEON two").unwrap();
        fs::write(dir.join("sub").join("b.md"), "\u{feff}a neon sign").unwrap();
        let utf16: Vec<u8> = [0xFF, 0xFE].into_iter().chain("wide neon".encode_utf16().flat_map(u16::to_le_bytes)).collect();
        fs::write(dir.join("c.txt"), utf16).unwrap();
        fs::write(dir.join("d.txt"), crate::files::encode("néon? no: neon café", "windows-1252", false).unwrap()).unwrap();
        fs::write(dir.join("binary.bin"), [b'n', b'e', b'o', b'n', 0, 1, 2]).unwrap();
        fs::write(dir.join(".secret").join("e.txt"), "hidden neon").unwrap();

        for threads in [1, 0] {
            let result = find(&options(&dir, "neon"), threads).unwrap();
            let names: Vec<String> = result
                .hits
                .iter()
                .map(|hit| format!("{}:{}", Path::new(&hit.path).file_name().unwrap().to_string_lossy(), hit.line))
                .collect();
            assert_eq!(names, ["a.txt:1", "a.txt:3", "c.txt:1", "d.txt:1", "b.md:1"], "threads {threads}");
            assert_eq!(result.files_with_hits, 4);
            assert!(!result.truncated);
        }

        let mut with_hidden = options(&dir, "neon");
        with_hidden.hidden = true;
        assert_eq!(find(&with_hidden, 0).unwrap().files_with_hits, 5);

        let mut top_only = options(&dir, "neon");
        top_only.subfolders = false;
        assert_eq!(find(&top_only, 0).unwrap().files_with_hits, 3);

        let mut limited = options(&dir, "neon");
        limited.max_hits = 2;
        let result = find(&limited, 0).unwrap();
        assert_eq!(result.hits.len(), 2);
        assert!(result.truncated);

        fs::remove_dir_all(&dir).unwrap();
    }
}
