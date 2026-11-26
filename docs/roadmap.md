# Roadmap

What Anonymous Notepad builds, in order, and why. Each item answers a need from [research.md](research.md) or adds to the neon sunset identity. Effort is a rough guess: low is an evening, medium is a few days, high is a week or more.

"Look" means the item strengthens the visual identity. "Function" means it only makes the editor more useful. Some do both.

## Shipped in 0.2.0

These were picked first because each is visible on the first launch or fixes a top complaint, and none took more than a day.

| Idea | The need it answers | Effort | Kind |
| --- | --- | --- | --- |
| Themes as radio stations: six themes on a dial in the status bar, `Ctrl+Alt+T` tunes to the next | Custom colour schemes are painful to make in Notepad++, and its dark mode stops at plugin dialogs. Here every panel follows the theme. | Medium | Look |
| A light theme (Flamingo morning) and a high-contrast one (Neon noir) | Not everyone can read light text on dark for hours | Low | Both |
| Every theme's colours tested to 4.5:1 contrast | Readability over long sessions; a test fails if a colour drops below | Low | Function |
| Neon glow in three levels: off, soft (frame only), full (code too) | The identity, without forcing glow on people who want crisp text | Low | Look |
| Icon toolbar drawn from vector icons | Notepad++'s toolbar is called dated and hard to read, and its icons blur on scaled screens | Low | Both |
| Start screen with recent files | A first tab that says what the app is and gets you back to work | Low | Look |
| Short splash while the session loads | No white flash on start; it disappears the moment the tabs are ready | Low | Look |
| Save when the window loses focus (off by default) | Autosave is a plugin in Notepad++ | Low | Function |
| A backup copy of the session file | People have lost months of unsaved tabs | Low | Function |
| Format and minify JSON, Base64 and URL encode and decode | These are among the most installed Notepad++ plugins | Low | Function |

True since 0.1.0 and worth saying: the installer needs no administrator rights, and there is no account or assistant. Since 0.4.0 the only network request is the signed update check, which can be turned off.

## Shipped in 0.4.1

| Idea | The need it answers | Effort | Kind |
| --- | --- | --- | --- |
| Match markers on the scrollbar for search hits, bookmarks and highlight colours | Requested in Notepad++ since 2017 | Medium | Both |
| Replace in files, with a preview of every change before it is written | The biggest missing search feature | Medium | Function |

## Shipped in 0.4.0

| Idea | The need it answers | Effort | Kind |
| --- | --- | --- | --- |
| Signed self-updater from the GitHub releases, with install at start-up, tell me, or off | Notepad++'s update channel was hijacked in 2025; here every update must match the app's own key | Medium | Function |

## Shipped in 0.3.0

| Idea | The need it answers | Effort | Kind |
| --- | --- | --- | --- |
| Find in files on every processor core | Searching big folders is slow elsewhere; here 12,033 files take 77 ms | Low | Function |
| Load restored tabs only when they are first shown | Notepad++ takes 20 to 50 seconds with a few hundred tabs | Medium | Function |
| Large-file viewer: a read-only, memory-mapped view for files over 50 MB | Sublime Text is praised for multi-gigabyte files; this opened a 2 GB log in 0.9 s | High | Function |

## Shipped in 0.2.1

| Idea | The need it answers | Effort | Kind |
| --- | --- | --- | --- |
| Interface size that fits the window, 100% to 200% | Menus and panels were tiny on a very wide screen | Low | Both |

## Next, in this order

| # | Idea | The need it answers | Effort | Kind |
| --- | --- | --- | --- | --- |
| 2 | Burner tab: a tab that is never written to the session file | Windows Notepad's session restore has leaked private text | Low | Both |
| 3 | Format XML | The other half of the most-used formatter plugins | Low | Function |
| 6 | Compare two tabs side by side | Compare is the plugin people install first | Medium | Function |
| 7 | Markdown preview beside the text | Praised in VS Code; Windows Notepad's Markdown is toolbar-driven | Medium | Function |
| 8 | Mixtapes: named, coloured groups of tabs you can collapse | Tab groups are a top open request in Notepad++ | Medium | Both |
| 9 | Portable build: one folder, settings beside the program | Locked-down work machines | Low | Function |
| 10 | Register as an "Open with" choice for text files | Windows Notepad cannot be replaced as the default easily | Low | Function |
| 11 | Screen reader pass with NVDA: announce find results, label every control | Open accessibility gaps in Notepad++ since 2021 | Medium | Function |
| 12 | Split view | Two files, or two places in one file, side by side | Medium | Function |
| 13 | Shortcut remapping, including two-step chords | A top open request in Notepad++ | Medium | Function |
| 14 | Macro recording | One of the things people love in Notepad++ | High | Function |
| 15 | Follow a growing file in the viewer, like `tail -f` | Log watching; the viewer shows a file as it was when opened | Medium | Function |
| 16 | Print with a preview | Print preview is an open request in Notepad++ | Medium | Function |
| 17 | macOS and Linux builds | Notepad++ is Windows only | Medium | Function |

Not planned for now: language server support and a plugin system. Both are high effort, and the plan is to build the common plugin jobs in before opening the door to plugins.

## Ideas of my own for the identity

Nobody asked for these. They are here because they make the app feel like itself, and each one is optional and off the typing path.

| Idea | What it is | Effort |
| --- | --- | --- |
| Clock tuning | The dial follows the time of day: Flamingo morning by day, Golden hour at dusk, Vice night after dark | Low |
| Build your own station | A colour picker that makes a theme, checks its contrast and saves it as a file you can share | Medium |
| Postcard export | Copy the selected code as an image framed by the sunset, for sharing | Medium |
| Heat meter | One to five stars in the status bar for how many tabs have unsaved changes | Low |
| Sunset indent guides | Indent guides that step through the sunset colours by depth | Low |
| Cassette sounds | A soft click when you change station and when a long search finishes; off by default | Low |
| Night drive mode | Distraction free, plus a slow horizon line under the text that moves as you scroll | Medium |

## Rules that keep it fast

- Nothing decorative runs while you type. Glow is a static shadow; there are no per-keystroke animations.
- Every effect has an off switch in Preferences.
- No network use beyond the update check.
