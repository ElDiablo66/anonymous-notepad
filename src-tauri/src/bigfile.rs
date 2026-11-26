//! A read-only view of files too large to load into the editor. The file is
//! memory-mapped, so opening it costs one pass to count lines and reading a
//! screenful costs a few kilobytes, whatever the file's size.

use memchr::{memchr, memchr_iter, memrchr};
use memmap2::Mmap;
use regex::bytes::{Regex, RegexBuilder};
use serde::Serialize;
use std::collections::HashMap;
use std::fs::File;
use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, LazyLock, Mutex};

/// The offset of every 256th line is kept; lines in between are found by scanning from there.
const STEP: usize = 256;
/// Longer lines are cut for display, so one giant line cannot freeze the window.
const MAX_LINE_BYTES: usize = 20_000;

pub struct BigFile {
    map: Mmap,
    /// Where the text starts, after a UTF-8 byte order mark if there is one.
    start: usize,
    marks: Vec<usize>,
    lines: usize,
}

#[derive(Serialize)]
pub struct BigInfo {
    pub id: u32,
    pub name: String,
    pub path: String,
    pub size: u64,
    pub lines: usize,
}

#[derive(Serialize, Debug, PartialEq)]
pub struct BigHit {
    /// Zero-based line.
    pub line: usize,
    /// Column and length in UTF-16 units.
    pub col: usize,
    pub len: usize,
}

impl BigFile {
    pub fn open(path: &Path) -> Result<Self, String> {
        let file = File::open(path).map_err(|e| format!("Cannot open {}: {e}", path.display()))?;
        // Safety: the map is read-only. If another program rewrites the file while it is
        // open here, the text shown can change under the viewer; nothing is written back.
        let map = unsafe { Mmap::map(&file) }.map_err(|e| format!("Cannot map {}: {e}", path.display()))?;
        if map.starts_with(&[0xFF, 0xFE]) || map.starts_with(&[0xFE, 0xFF]) {
            return Err("The large-file viewer reads UTF-8 and single-byte text. This file is UTF-16.".into());
        }
        let start = if map.starts_with(&[0xEF, 0xBB, 0xBF]) { 3 } else { 0 };
        let mut marks = vec![start];
        let mut lines = 1usize;
        for newline in memchr_iter(b'\n', &map[start..]) {
            if lines % STEP == 0 {
                marks.push(start + newline + 1);
            }
            lines += 1;
        }
        Ok(BigFile { map, start, marks, lines })
    }

    pub fn lines(&self) -> usize {
        self.lines
    }

    /// The byte offset where a zero-based line starts.
    fn offset_of(&self, line: usize) -> usize {
        let line = line.min(self.lines - 1);
        let mut offset = self.marks[line / STEP];
        for _ in 0..line % STEP {
            match memchr(b'\n', &self.map[offset..]) {
                Some(at) => offset += at + 1,
                None => break,
            }
        }
        offset
    }

    /// The zero-based line that holds a byte offset.
    fn line_at(&self, offset: usize) -> usize {
        let block = self.marks.partition_point(|&mark| mark <= offset) - 1;
        block * STEP + memchr_iter(b'\n', &self.map[self.marks[block]..offset]).count()
    }

    fn line_start(&self, offset: usize) -> usize {
        memrchr(b'\n', &self.map[self.start..offset]).map_or(self.start, |at| self.start + at + 1)
    }

    pub fn read(&self, from: usize, count: usize) -> Vec<String> {
        let mut out = Vec::with_capacity(count);
        if from >= self.lines {
            return out;
        }
        let mut offset = self.offset_of(from);
        for _ in 0..count.min(self.lines - from) {
            let rest = &self.map[offset..];
            let end = memchr(b'\n', rest).unwrap_or(rest.len());
            out.push(show(&rest[..end]));
            offset += end + 1;
            if offset > self.map.len() {
                break;
            }
        }
        out
    }

    /// The first match after (or before) a position. `line` and `col` say where the last one was.
    pub fn find(&self, pattern: &Regex, line: usize, col: usize, backward: bool) -> Option<BigHit> {
        let line_offset = self.offset_of(line);
        let line_end = memchr(b'\n', &self.map[line_offset..]).map_or(self.map.len(), |at| line_offset + at);
        let from = (line_offset + byte_of_column(&self.map[line_offset..line_end], col)).min(self.map.len());
        let found = if backward { self.last_before(pattern, from) } else { pattern.find_at(&self.map[..], from).filter(|m| !m.is_empty()) };
        let found = found?;
        let start = self.line_start(found.start());
        Some(BigHit {
            line: self.line_at(found.start()),
            col: String::from_utf8_lossy(&self.map[start..found.start()]).encode_utf16().count(),
            len: String::from_utf8_lossy(found.as_bytes()).encode_utf16().count(),
        })
    }

    /// Walks the line blocks backwards; within a block the last match wins.
    fn last_before(&self, pattern: &Regex, limit: usize) -> Option<regex::bytes::Match<'_>> {
        let mut block = self.marks.partition_point(|&mark| mark < limit);
        let mut end = limit;
        while block > 0 {
            block -= 1;
            let begin = self.marks[block];
            if let Some(found) = pattern.find_iter(&self.map[begin..end]).filter(|m| !m.is_empty()).last() {
                let (from, to) = (begin + found.start(), begin + found.end());
                return pattern.find_at(&self.map[..to], from);
            }
            end = begin;
        }
        None
    }
}

/// Turns a column counted in UTF-16 units into a byte offset within the line.
fn byte_of_column(line: &[u8], col: usize) -> usize {
    let text = String::from_utf8_lossy(line);
    let mut units = 0;
    for (index, ch) in text.char_indices() {
        if units >= col {
            return index.min(line.len());
        }
        units += ch.len_utf16();
    }
    line.len()
}

fn show(line: &[u8]) -> String {
    let line = line.strip_suffix(b"\r").unwrap_or(line);
    let (shown, cut) = if line.len() > MAX_LINE_BYTES { (&line[..MAX_LINE_BYTES], true) } else { (line, false) };
    let mut text = match std::str::from_utf8(shown) {
        Ok(text) => text.to_string(),
        // Not UTF-8: old single-byte text reads best as Windows-1252. A line cut mid-character lands here too.
        Err(error) if cut && error.error_len().is_none() => String::from_utf8_lossy(&shown[..error.valid_up_to()]).into_owned(),
        Err(_) => encoding_rs::WINDOWS_1252.decode_without_bom_handling(shown).0.into_owned(),
    };
    if cut {
        text.push_str(" … (line cut for display)");
    }
    text
}

pub fn build_pattern(what: &str, mode: &str, match_case: bool, whole_word: bool) -> Result<Regex, String> {
    let mut source = match mode {
        "regex" => what.to_string(),
        "extended" => regex::escape(&crate::search::unescape_extended(what)),
        _ => regex::escape(what),
    };
    if whole_word {
        source = format!(r"\b(?:{source})\b");
    }
    RegexBuilder::new(&source)
        .case_insensitive(!match_case)
        .multi_line(true)
        // Matching on raw bytes lets the search run over text that is not valid UTF-8.
        .unicode(true)
        .build()
        .map_err(|e| format!("The search pattern is not valid: {e}"))
}

static OPEN: LazyLock<Mutex<HashMap<u32, Arc<BigFile>>>> = LazyLock::new(|| Mutex::new(HashMap::new()));
static NEXT_ID: AtomicU32 = AtomicU32::new(1);

fn get(id: u32) -> Result<Arc<BigFile>, String> {
    OPEN.lock().unwrap().get(&id).cloned().ok_or_else(|| "This file is no longer open in the viewer".to_string())
}

#[tauri::command(async)]
pub fn big_open(path: String) -> Result<BigInfo, String> {
    let target = Path::new(&path);
    let size = std::fs::metadata(target).map_err(|e| format!("Cannot open {path}: {e}"))?.len();
    let file = BigFile::open(target)?;
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let lines = file.lines();
    OPEN.lock().unwrap().insert(id, Arc::new(file));
    Ok(BigInfo {
        id,
        name: target.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        path,
        size,
        lines,
    })
}

#[tauri::command(async)]
pub fn big_read(id: u32, from: usize, count: usize) -> Result<Vec<String>, String> {
    Ok(get(id)?.read(from, count.min(2000)))
}

#[tauri::command(async)]
#[allow(clippy::too_many_arguments)]
pub fn big_find(
    id: u32,
    what: String,
    mode: String,
    match_case: bool,
    whole_word: bool,
    line: usize,
    col: usize,
    backward: bool,
) -> Result<Option<BigHit>, String> {
    if what.is_empty() {
        return Ok(None);
    }
    let pattern = build_pattern(&what, &mode, match_case, whole_word)?;
    Ok(get(id)?.find(&pattern, line, col, backward))
}

#[tauri::command]
pub fn big_close(id: u32) {
    OPEN.lock().unwrap().remove(&id);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn sample(name: &str, text: &[u8]) -> PathBuf {
        let path = std::env::temp_dir().join(format!("anonymous-notepad-big-{name}.txt"));
        fs::write(&path, text).unwrap();
        path
    }

    #[test]
    fn counts_and_reads_lines_across_blocks() {
        let mut text = String::new();
        for number in 0..1000 {
            text.push_str(&format!("line {number}\r\n"));
        }
        text.push_str("last, no newline");
        let path = sample("blocks", text.as_bytes());
        let file = BigFile::open(&path).unwrap();
        assert_eq!(file.lines(), 1001);
        assert_eq!(file.read(0, 2), ["line 0", "line 1"]);
        assert_eq!(file.read(255, 3), ["line 255", "line 256", "line 257"]);
        assert_eq!(file.read(999, 5), ["line 999", "last, no newline"]);
        assert!(file.read(5000, 5).is_empty());
        assert_eq!(file.line_at(file.offset_of(700)), 700);
        drop(file);
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn skips_the_byte_order_mark_and_ends_on_an_empty_line() {
        let path = sample("mark", b"\xEF\xBB\xBFfirst\nsecond\n");
        let file = BigFile::open(&path).unwrap();
        assert_eq!(file.lines(), 3);
        assert_eq!(file.read(0, 3), ["first", "second", ""]);
        drop(file);
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn finds_forward_and_backward_with_columns() {
        let mut text = String::new();
        for number in 0..600 {
            text.push_str(if number == 10 || number == 400 { "héllo NEON sign\n" } else { "plain\n" });
        }
        let path = sample("find", text.as_bytes());
        let file = BigFile::open(&path).unwrap();
        let pattern = build_pattern("neon", "normal", false, false).unwrap();

        let first = file.find(&pattern, 0, 0, false).unwrap();
        assert_eq!(first, BigHit { line: 10, col: 6, len: 4 });
        let second = file.find(&pattern, first.line, first.col + first.len, false).unwrap();
        assert_eq!(second.line, 400);
        assert_eq!(file.find(&pattern, second.line, second.col + second.len, false), None);

        let back = file.find(&pattern, second.line, second.col, true).unwrap();
        assert_eq!(back.line, 10);
        assert_eq!(file.find(&pattern, back.line, back.col, true), None);
        assert_eq!(file.find(&pattern, 599, 0, true).unwrap().line, 400);

        let cased = build_pattern("neon", "normal", true, false).unwrap();
        assert_eq!(file.find(&cased, 0, 0, false), None);
        drop(file);
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn long_lines_are_cut_and_old_encodings_still_read() {
        let mut bytes = vec![b'x'; MAX_LINE_BYTES + 500];
        bytes.extend_from_slice(b"\ncaf\xE9\n");
        let path = sample("long", &bytes);
        let file = BigFile::open(&path).unwrap();
        let lines = file.read(0, 2);
        assert!(lines[0].ends_with("(line cut for display)"));
        assert!(lines[0].len() < MAX_LINE_BYTES + 100);
        assert_eq!(lines[1], "café");
        drop(file);
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn utf16_is_refused() {
        let path = sample("wide", &[0xFF, 0xFE, b'a', 0]);
        assert!(BigFile::open(&path).is_err());
        fs::remove_file(path).unwrap();
    }
}
