# Changelog

## 0.4.0, 26 November 2026

Added

- The app updates itself from its GitHub releases. It looks at start-up and every six hours. Preferences, Updates, chooses between installing at start-up (the default), being told with a bar above the text, and not looking at all. Each update must carry a signature that matches the key built into the app, or it is refused.
- Tabs and unsaved text are saved before an update installs, so they come back after the restart.

Changed

- The app now makes one kind of network request: the update check. Turn it off with "Don't look".

## 0.3.2, 26 November 2026

Fixed

- Large-file viewer: jumping to a line with the Line box now highlights that line, the way a find result is highlighted. It also leaves a few lines of context above it.

## 0.3.1, 26 November 2026

Fixed

- Preferences: rows ran into each other once the sheet was taller than the window, which a larger interface size makes likely. The size buttons sat on top of "Text size" and the reset button covered the web search address.
- At a large interface size in a small window the menu bar, tabs and status bar grew wider than the window. They now stay inside it, and the toolbar steps aside when there is no room.
- The start screen shrinks to fit instead of running off the editor area.

Changed

- Preferences has a hairline between settings and more room between groups, and "Interface size" has its own full-width row of buttons.

## 0.3.0, 26 November 2026

Added

- Large-file viewer. Files over 50 MB open in a read-only viewer that reads only the lines on screen. A 2 GB log with 30 million lines opened in under a second in testing. It has its own go-to-line and find, and files up to 256 MB can be moved into the editor from there.
- Benchmarks you can run yourself: `cargo run --release --example bench`.

Faster

- Find in files runs on every processor core. On 12,033 files it took 77 ms where one core took 775 ms (no matches), and 680 ms where one core took 1,689 ms (44,308 matches), on a 16-core PC.
- Tabs restored from the last session read their file the first time you look at them, so a session with hundreds of tabs opens as fast as one with a single tab.

Changed

- Find in files now skips files over 64 MB (it was 32 MB) and lists results sorted by file, then line.

## 0.2.1, 26 November 2026

Fixed

- The editor came up unstyled in the installed app: pink lines across the top, the line number at the window's edge and odd typing. The splash added in 0.2.0 carried an inline style block, which made the desktop shell refuse the styles the editor adds at run time. The splash styles are in a file now, and a test keeps inline styles out of the page.
- The start screen could sit off-centre.

Added

- Interface size. "Fit" picks a size from the window's width, so menus, tabs and panels are readable on a very wide screen; 100% to 200% can be picked by hand. It is in Preferences and under View.

Changed

- "Zoom" in the View menu is now "Text zoom", to tell it apart from the interface size.

## 0.2.0, 26 November 2026

Added

- Six themes laid out as radio stations, with a dial in the status bar: Flamingo morning (light), Golden hour, Vice night, Ocean drive, Everglades and Neon noir (high contrast). `Ctrl+Alt+T` and `Ctrl+Alt+Shift+T` tune up and down.
- Neon glow in three levels: off, soft and full.
- An icon toolbar beside the menu.
- A start screen with recent files, shown while the only tab is empty.
- A short splash while the session loads.
- Save when the window loses focus (Preferences, off by default).
- A backup copy of the session file, used when the main one cannot be read.
- Format JSON (`Ctrl+Alt+J`), minify JSON, Base64 encode and decode, URL encode and decode.
- A test that holds every theme's text and code colours to a contrast of 4.5:1.
- The MIT licence, and a file of third-party licence texts in the installer.

Changed

- Comment colours are lighter in every dark theme so they pass the contrast test.
- Code colours are set in the stylesheet with the themes.

## 0.1.0, 26 November 2026

First version: tabs with session restore, find and replace, find in files, bookmarks, line and case tools, column editor, encodings, folder tree, outline, hashes, command list and three themes.
