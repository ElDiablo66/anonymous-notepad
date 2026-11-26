# Third-party packages

Anonymous Notepad's own code is under the [MIT licence](LICENSE). It is built on the packages below, which keep their own licences. Each licence listed is the one the package declares in its manifest.

This page lists the packages the project depends on directly. `npm run notices` walks the whole dependency tree (333 packages at version 0.2.0) and writes every licence text into `third-party notices.txt`, which ships in the installer next to the program.

None of them is under the GPL or another strong copyleft licence. Five Rust crates that come in through Tauri (`cssparser`, `cssparser-macros`, `selectors`, `dtoa-short`, `option-ext`) use the MPL-2.0, which asks that changes to those crates' own files stay open; this project uses them unchanged. Seven packages ship no licence file of their own, so the notices file records the licence they declare.

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
