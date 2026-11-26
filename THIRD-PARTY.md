# Third-party packages

Anonymous Notepad is built on the packages below. Each licence is the one the package declares in its own manifest. Their transitive dependencies are recorded in `package-lock.json` and `src-tauri/Cargo.lock`.

## Interface (npm)

| Package | Licence |
| --- | --- |
| codemirror, @codemirror/state, view, commands, search, language, language-data, autocomplete | MIT |
| @lezer/highlight | MIT |
| @replit/codemirror-minimap | MIT |
| @replit/codemirror-indentation-markers | MIT |
| react, react-dom | MIT |
| @phosphor-icons/react | MIT |
| @tauri-apps/api, plugin-dialog, plugin-opener | MIT or Apache-2.0 |

## Fonts (bundled through Fontsource)

| Font | Licence |
| --- | --- |
| JetBrains Mono | OFL-1.1 |
| Instrument Sans | OFL-1.1 |
| Barlow Condensed | OFL-1.1 |
| Yellowtail | Apache-2.0 |

## Backend (Rust crates)

| Crate | Licence |
| --- | --- |
| tauri, tauri-plugin-dialog, tauri-plugin-opener, tauri-plugin-single-instance | MIT or Apache-2.0 |
| serde, serde_json | MIT or Apache-2.0 |
| encoding_rs | (Apache-2.0 or MIT) and BSD-3-Clause |
| chardetng | MIT or Apache-2.0 |
| regex | MIT or Apache-2.0 |
| walkdir | Unlicense or MIT |
| trash | MIT |
| md-5, sha1, sha2 | MIT or Apache-2.0 |

## Artwork

The logo, the sunset drawing and the three colour themes were made for this project. No artwork, fonts or text from any other editor or game are included.
