//! Find in files: walks a folder and reports every matching line.

use crate::files::decode;
use regex::{Regex, RegexBuilder};
use serde::{Deserialize, Serialize};
use std::fs;
use walkdir::{DirEntry, WalkDir};

const MAX_SEARCH_BYTES: u64 = 32 * 1024 * 1024;
const MAX_LINE_CHARS: usize = 400;

#[derive(Deserialize)]
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

#[derive(Serialize)]
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

fn is_hidden(entry: &DirEntry) -> bool {
    if entry.depth() == 0 {
        return false;
    }
    if entry.file_name().to_string_lossy().starts_with('.') {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if let Ok(meta) = entry.metadata() {
            return meta.file_attributes() & 0x2 != 0;
        }
    }
    false
}

fn looks_binary(bytes: &[u8]) -> bool {
    let has_utf16_mark = bytes.starts_with(&[0xFF, 0xFE]) || bytes.starts_with(&[0xFE, 0xFF]);
    !has_utf16_mark && bytes.iter().take(8192).any(|&b| b == 0)
}

fn shorten(line: &str) -> String {
    if line.chars().count() <= MAX_LINE_CHARS {
        line.to_string()
    } else {
        line.chars().take(MAX_LINE_CHARS).collect::<String>() + "…"
    }
}

pub fn search_text(pattern: &Regex, path: &str, text: &str, hits: &mut Vec<Hit>, max_hits: usize) -> bool {
    let mut found = false;
    for (index, raw) in text.split('\n').enumerate() {
        let line = raw.strip_suffix('\r').unwrap_or(raw);
        for m in pattern.find_iter(line) {
            if m.start() == m.end() {
                continue;
            }
            found = true;
            if hits.len() >= max_hits {
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

#[tauri::command(async)]
pub fn find_in_files(options: FindOptions) -> Result<FindResult, String> {
    if options.what.is_empty() {
        return Err("Type something to search for".into());
    }
    let pattern = build_pattern(&options.what, &options.mode, options.match_case, options.whole_word)?;
    let filters = Filters::parse(&options.filters);
    let max_hits = options.max_hits.clamp(1, 100_000);
    let mut result = FindResult { hits: Vec::new(), files_searched: 0, files_with_hits: 0, truncated: false };

    let mut walker = WalkDir::new(&options.dir).follow_links(false);
    if !options.subfolders {
        walker = walker.max_depth(1);
    }
    let show_hidden = options.hidden;
    for entry in walker.into_iter().filter_entry(|e| show_hidden || !is_hidden(e)).filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() || !filters.accepts(&entry.file_name().to_string_lossy()) {
            continue;
        }
        let too_big = entry.metadata().map(|m| m.len() > MAX_SEARCH_BYTES).unwrap_or(true);
        if too_big {
            continue;
        }
        let Ok(bytes) = fs::read(entry.path()) else { continue };
        if looks_binary(&bytes) {
            continue;
        }
        let Ok(decoded) = decode(&bytes, None) else { continue };
        result.files_searched += 1;
        let path = entry.path().to_string_lossy();
        if search_text(&pattern, &path, &decoded.text, &mut result.hits, max_hits) {
            result.files_with_hits += 1;
        }
        if result.hits.len() >= max_hits {
            result.truncated = true;
            break;
        }
    }
    Ok(result)
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
}
