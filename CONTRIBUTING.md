# Contributing

Thanks for wanting to help. Bug reports and ideas go in [issues](https://github.com/ElDiablo66/anonymous-notepad/issues). For anything bigger than a small fix, open an issue before writing code so we can agree on the shape of it.

## Set-up

You need Node.js, Rust and the Microsoft C++ build tools. The project is built with Node.js 24 and Rust 1.99.

```powershell
npm install
```

```powershell
npm run tauri dev
```

For interface work you often do not need the desktop shell. `npm run dev` serves the interface on `http://localhost:5184`; add `?demo` for sample tabs. File access is replaced by an in-memory stand-in there.

## Before you open a pull request

```powershell
npm run build
```

```powershell
npm test
```

```powershell
npm run notices
```

```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```

All four run on every pull request. Run `npm run build` and `npm run notices` once before `cargo test`, because the Rust build expects the web files and the notices file to exist.

`npm test` covers the line, case, number and conversion tools and checks the contrast of every theme. `cargo test` covers encoding detection and round trips, line endings, find in files across a folder, file filters, the large-file viewer, the hashes and the session backup.

## Map of the source

| Part | Where |
| --- | --- |
| Reading, writing, encodings, folder listing | `src-tauri/src/files.rs` |
| Find in files | `src-tauri/src/search.rs` |
| Large-file viewer | `src-tauri/src/bigfile.rs`, `src/components/BigViewer.tsx` |
| Benchmarks | `src-tauri/examples/bench.rs` |
| Hashes, saved session, command line | `src-tauri/src/lib.rs` |
| Editor set-up, bookmarks, marks | `src/editor/` |
| Every command, the menus and the keys | `src/commands.ts` |
| Themes and their places on the dial | `src/themes.ts`, `src/styles.css` |
| Line, case, number and conversion tools | `src/textops.ts` |
| Interface | `src/components/` |
| Logo, screenshots and README pictures | `Design/` (the README pictures are drawn from `Design/source/`) |
| Research and roadmap | `docs/` |

## Where things go

- A new action is one `add({...})` entry in `src/commands.ts`. That puts it in the command list; add its id to a menu in the same file if it belongs in one.
- Text transformations are pure functions in `src/textops.ts`, each with a test in `src/textops.test.ts`.
- Anything that touches the disk or the system goes through `src/platform.ts` and a command in `src-tauri/src/`.
- A new theme is one block of variables in `src/styles.css` and one entry in `src/themes.ts`. The contrast test in `src/themes.test.ts` picks it up by itself and must pass.

## Two rules

1. Original work only. No artwork, fonts, logos, names or text from any game, film or other editor, and no code copied from projects whose licence does not allow it. If a picture is inspired by something, draw it yourself. Fonts and packages need a licence that allows redistribution, and a line in `THIRD-PARTY.md`.
2. No network. The app makes no requests and has no updater or telemetry. Features that need the internet are out of scope.

## Style

- TypeScript and Rust as the compiler and the existing code have them; there are no extra lint rules to learn.
- Interface text is sentence case, plain and short. Error messages say what happened and what to do.
- Every effect needs an off switch, and nothing decorative may run on each keystroke.
- Commit messages say what changed in one plain sentence.

## Licence

By contributing you agree that your work is released under the [MIT licence](LICENSE).
