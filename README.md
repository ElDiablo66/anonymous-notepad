# Anonymous Notepad

A text and code editor for Windows with tabs that survive a restart, search across files, and a neon sunset look. The file work is written in Rust; the window is a Tauri v2 app.

![The editor in the Vice night theme, with a JavaScript file open](Design/screens/editor%20vice%20night.jpg)

## What it does

- Tabs that come back after a restart, including text you never saved. Closing the app does not ask about unsaved tabs; closing a single tab does.
- Syntax colours for more than a hundred languages, picked from the file name or by hand (`Ctrl+Shift+G`).
- Find and replace in normal, extended (`\n`, `\t`, `\x41`) and regular expression mode, with count, find all in open files, and a results list you can click through.
- Find in files across a folder, with name filters such as `*.rs; *.toml; !*.lock`.
- Bookmarks in the margin, five highlight colours for marking every occurrence of a word, and a mark tab in the find panel.
- Line tools: 14 sorts, remove duplicates, remove empty lines, reverse, shuffle, join, split, trim, tabs to spaces and back.
- Case tools, a column editor that inserts text or a number series down many lines, multiple cursors (`Ctrl` and click) and column selection (`Alt` and drag).
- Encodings: UTF-8 with or without BOM, UTF-16 LE and BE, and 22 legacy code pages. A file is read in the encoding it was written in and saved back the same way. Line endings are detected and can be converted.
- A side panel with a folder tree, the list of open files and an outline of functions, classes and headings.
- MD5, SHA-1, SHA-256 and SHA-512 of text or of files.
- A command list (`Ctrl+Shift+P`) that searches every action, and three themes: Vice night, Ocean drive and Golden hour.

![Search results across two open files, in the Ocean drive theme](Design/screens/search%20results%20ocean%20drive.jpg)

## Install

There is no published release yet. Build the installer from source (next section), then run the `.exe` it produces. It installs for the current user and needs no administrator rights.

Windows 11 is the only system it has been built on.

## Build from source

You need [Node.js](https://nodejs.org), [Rust](https://rustup.rs) and the Microsoft C++ build tools that Rust asks for on Windows. The project was built with Node.js 24 and Rust 1.99; older versions are untested.

```powershell
npm install
```

```powershell
npm run tauri build
```

The installer lands in `src-tauri/target/release/bundle/nsis/`.

To work on the app with live reload:

```powershell
npm run tauri dev
```

## Tests

```powershell
npm test
```

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```

`npm test` covers the line, case and number tools. `cargo test` covers encoding detection and round trips, line-ending detection, find in files, file filters and the hashes.

## Keys worth knowing

| Action | Key |
| --- | --- |
| Command list | `Ctrl+Shift+P` |
| Find, replace, find in files | `Ctrl+F`, `Ctrl+H`, `Ctrl+Shift+F` |
| Find next and previous | `F3`, `Shift+F3` |
| Go to line | `Ctrl+G` |
| Toggle, next, previous bookmark | `Ctrl+F2`, `F2`, `Shift+F2` |
| Duplicate line, delete line | `Ctrl+D`, `Ctrl+Shift+L` |
| Move line up or down | `Ctrl+Shift+Up`, `Ctrl+Shift+Down` |
| Toggle comment | `Ctrl+Q` |
| Column editor | `Alt+C` |
| Reopen closed file | `Ctrl+Shift+T` |
| Folder panel | `Ctrl+Alt+W` |
| Distraction free, full screen | `F12`, `F11` |
| Preferences | `Ctrl+,` |

The full list is under Tools, Keyboard shortcuts.

## Where your data lives

Open tabs, unsaved text and preferences are kept in two files in `%APPDATA%\app.anonymousnotepad.desktop\`: `session.json` and `settings.json`. Delete them to start clean. The app makes no network requests. The one exception is the "Search the web for the selection" command, which opens your browser at the address set in Preferences.

## Known limits

- The editor keeps the whole file in memory and draws it in a web view. Files of a few megabytes are fine; files over 256 MB are refused.
- Find in files uses Rust regular expressions; find in the editor uses JavaScript ones. Lookbehind and backreferences work in the editor only.
- No printing, macro recording, split view, plugins or replace in files yet.
- The outline is pattern based. It covers about 30 languages and can miss unusual code layouts.

## How it is put together

| Part | Where |
| --- | --- |
| Reading, writing, encodings, folder listing | `src-tauri/src/files.rs` |
| Find in files | `src-tauri/src/search.rs` |
| Hashes, saved session, command line | `src-tauri/src/lib.rs` |
| Editor set-up, bookmarks, marks, colours | `src/editor/` |
| Every command, the menus and the keys | `src/commands.ts` |
| Line, case and number tools | `src/textops.ts` |
| Interface | `src/components/`, `src/styles.css` |

The editor component is [CodeMirror 6](https://codemirror.net). Third-party packages and the licences they declare are listed in [THIRD-PARTY.md](THIRD-PARTY.md). The artwork, logo and themes were drawn for this project.

## Licence

No licence has been chosen yet, so the code is not open for reuse until one is added.
