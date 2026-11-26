//! Timings for the two jobs done in Rust: find in files and the large-file viewer.
//!
//!   cargo run --release --example bench -- find <folder> <text>
//!   cargo run --release --example bench -- make <file> <megabytes>
//!   cargo run --release --example bench -- big <file> <text>

use anonymous_notepad_lib::bigfile::{build_pattern, BigFile};
use anonymous_notepad_lib::search::{find, FindOptions};
use std::io::{BufWriter, Write};
use std::path::Path;
use std::time::Instant;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match args.iter().map(String::as_str).collect::<Vec<_>>().as_slice() {
        ["find", folder, text] => bench_find(folder, text),
        ["make", file, megabytes] => make(file, megabytes.parse().expect("megabytes must be a number")),
        ["big", file, text] => bench_big(file, text),
        _ => eprintln!("usage: bench find <folder> <text> | make <file> <megabytes> | big <file> <text>"),
    }
}

fn bench_find(folder: &str, text: &str) {
    let options = FindOptions {
        dir: folder.to_string(),
        what: text.to_string(),
        mode: "normal".into(),
        match_case: false,
        whole_word: false,
        filters: String::new(),
        subfolders: true,
        hidden: true,
        max_hits: 100_000,
    };
    // One warm-up pass so both timed runs read from the file cache.
    let _ = find(&options, 0);
    for (label, threads) in [("one core", 1), ("all cores", 0)] {
        let started = Instant::now();
        let result = find(&options, threads).expect("search failed");
        println!(
            "{label}: {} ms, {} files searched, {} matches in {} files",
            started.elapsed().as_millis(),
            result.files_searched,
            result.hits.len(),
            result.files_with_hits
        );
    }
}

fn make(file: &str, megabytes: u64) {
    let mut out = BufWriter::new(std::fs::File::create(file).expect("cannot create the file"));
    let mut written = 0u64;
    let mut number = 0u64;
    while written < megabytes * 1024 * 1024 {
        let line = format!("2026-11-26 12:{:02}:{:02} INFO request {number} served in {} ms from node-{}\n", number / 60 % 60, number % 60, number % 977, number % 12);
        written += line.len() as u64;
        out.write_all(line.as_bytes()).unwrap();
        number += 1;
    }
    out.write_all(b"the needle is on the last line\n").unwrap();
    println!("{file}: {} MB, {} lines", written / 1024 / 1024, number + 1);
}

fn bench_big(file: &str, text: &str) {
    let started = Instant::now();
    let big = BigFile::open(Path::new(file)).expect("cannot open the file");
    println!("open and count {} lines: {} ms", big.lines(), started.elapsed().as_millis());

    let started = Instant::now();
    let middle = big.read(big.lines() / 2, 60);
    let end = big.read(big.lines().saturating_sub(60), 60);
    println!("read 60 lines at the middle and 60 at the end: {} µs ({} + {} lines)", started.elapsed().as_micros(), middle.len(), end.len());

    let pattern = build_pattern(text, "normal", false, false).expect("bad pattern");
    let started = Instant::now();
    let hit = big.find(&pattern, 0, 0, false);
    println!("find \"{text}\" from the top: {} ms, {:?}", started.elapsed().as_millis(), hit.map(|h| h.line + 1));
}
