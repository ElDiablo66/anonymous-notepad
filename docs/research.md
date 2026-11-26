# What people want from a Windows text editor

Research from 26 November 2026, used to decide what Anonymous Notepad builds next. The plan that came out of it is in [roadmap.md](roadmap.md).

## How far to trust this

About 27 pages were read: Notepad++ GitHub issues, the Notepad++ community forum, Hacker News threads, the Windows Insider blog and press coverage. Reddit blocked every request, and so did a few news sites, so no Reddit thread or Feedback Hub post was read first-hand. Opinions below come from the places that could be opened.

- The thumbs-up counts on GitHub issues are small (tens), and only open issues were ranked.
- Two sources are aggregators that summarise older threads (windowsforum.com and tms-outsource.com). Their details are medium confidence.
- Reports about large files contradict each other. Some people praise Notepad++ on gigabyte logs, others say 1 to 2 GB overwhelms it.
- Windows Notepad's AI and sign-in rules changed several times during 2025 and 2026 and may have changed again.
- No statistics here are invented. Where a number appears, it is from the linked page.

## Notepad++

### What people like

- Unsaved "new" tabs survive restarts and forced reboots, so it doubles as a scratchpad. It closes without a save prompt and still keeps the text. ([HN 2024](https://news.ycombinator.com/item?id=42019586), [HN 2024](https://news.ycombinator.com/item?id=39854182))
- It is native, small and fast to start, which people contrast with Electron editors. ([HN 2024](https://news.ycombinator.com/item?id=42019586))
- The text chores: regex replace, sort, remove duplicates, mark lines and act on them, macro recording, show all characters to find line-ending and BOM problems. (same thread)
- Standard Windows hotkeys and visible commands; nobody needs a manual. ([HN 2024](https://news.ycombinator.com/item?id=39854725))
- It gets approved on locked-down work machines and has a portable build. ([HN 2024](https://news.ycombinator.com/item?id=42019586))

### Complaints and wishes

| Complaint | Detail | Source |
| --- | --- | --- |
| Blurry text on mixed-DPI monitors | Text blurs when the window moves between screens with different scaling. Open since 2019, 42 thumbs-up, still reported in 2025. | [issue 6284](https://github.com/notepad-plus-plus/notepad-plus-plus/issues/6284) |
| High-DPI work unfinished | The tracking issue from 2024 is still open; panels, splitters and plugins have no linked work. | [issue 14959](https://github.com/notepad-plus-plus/notepad-plus-plus/issues/14959) |
| Tab groups | Grouping for dozens or hundreds of tabs. Open since 2021, 26 thumbs-up. | [issue 9517](https://github.com/notepad-plus-plus/notepad-plus-plus/issues/9517) |
| Slow start with many tabs | 200 to 270 restored tabs take 20 to 50 seconds; people ask for lazy loading. | [issue 14000](https://github.com/notepad-plus-plus/notepad-plus-plus/issues/14000) |
| Lost unsaved work | One user lost nine months of never-saved edits after an update in 2026. The session backup is easy to misread as a save. | [forum thread](https://community.notepad-plus-plus.org/topic/27567/important-files-lost-during-recent-update) |
| No autosave in the core | People want save on focus loss and get pointed to a plugin. | [forum thread](https://community.notepad-plus-plus.org/topic/22215/autosave-plugin) |
| Updater compromise | The Register reported that the update channel was hijacked from June to December 2025; users were told to reinstall by hand. | [The Register, 2026](https://www.theregister.com/2026/02/02/notepad_plusplus_intrusion/) |
| Installer needs administrator rights | A per-user install was requested in 2024 and is still open. | [issue 15182](https://github.com/notepad-plus-plus/notepad-plus-plus/issues/15182) |
| No language server support | Requested in 2018; the maintainer has no plans. | [issue 4440](https://github.com/notepad-plus-plus/notepad-plus-plus/issues/4440) |
| No match markers on the scrollbar | Requested in 2017 with a long trail of +1s. | [issue 3116](https://github.com/notepad-plus-plus/notepad-plus-plus/issues/3116) |
| Dated toolbar | Many tiny buttons that are hard to read. | [HN 2024](https://news.ycombinator.com/item?id=39854182) |
| Dark mode stops at plugin dialogs | Some plugin windows stay light. | [issue 13574](https://github.com/notepad-plus-plus/notepad-plus-plus/issues/13574) |
| Screen reader gaps | NVDA does not read the matched line on find next. Open since 2021. | [issue 9332](https://github.com/notepad-plus-plus/notepad-plus-plus/issues/9332) |
| Windows only | Mac and Linux users miss it. | [HN 2024](https://news.ycombinator.com/item?id=42019586) |
| Update prompt on launch; custom colour schemes are painful to make | | [HN 2022](https://news.ycombinator.com/item?id=33189777) |
| Plugins Admin | Silent failures behind a proxy, installs that need run-as-admin, breakage in portable mode. | [roundup, 2026](https://tms-outsource.com/blog/posts/how-to-install-plugins-in-notepad/) |

### What its most-used plugins say is missing

There are no install counts for Plugins Admin, so this list is from a 2026 roundup and old SourceForge download numbers.

- Compare and ComparePlus: side-by-side diff.
- XML Tools and JSTool: pretty print, minify and validate XML and JSON.
- MIME Tools and Converter: Base64, URL and hex encoding.
- NppExec and PythonScript: run commands and scripts.
- AutoSave: timed saving and saving on focus loss.
- DSpellCheck, NppFTP, a file browser, clipboard history, a quick file switcher.

Sources: [roundup](https://tms-outsource.com/blog/posts/how-to-install-plugins-in-notepad/), [SourceForge](https://sourceforge.net/projects/npp-plugins/files/), [AutoSave thread](https://community.notepad-plus-plus.org/topic/22215/autosave-plugin).

## Windows Notepad (the Windows 11 version)

### What people like

- Tabs, dragging a tab out to its own window, and automatic titles for unsaved tabs. ([Windows Insider blog, 2023](https://blogs.windows.com/windows-insider/2023/01/19/tabs-in-notepad-begins-rolling-out-to-windows-insiders/))
- Session restore prevents lost drafts, and most new features can be turned off. ([windowsforum, 2026](https://windowsforum.com/news/windows-11-25h2-notepad-upgrade-tabs-markdown-session-restore-copilot.428589/))
- A 100 MB file opens at once, far better than the Windows 10 version. ([Petri, 2021, updated 2024](https://petri.com/tip-for-opening-large-text-files-in-windows-11/))

### Complaints and wishes

| Complaint | Detail | Source |
| --- | --- | --- |
| AI in a plain editor | Commenters want the update without AI and name it as a reason to switch. | [AlternativeTo, 2025](https://alternativeto.net/news/2025/5/notepad-for-windows-11-adds-text-formatting-markdown-support-and-new-toolbar) |
| Sign-in and credits | The AI tools need a Microsoft account and paid credits, and features arrive switched on. | [windowsforum, 2026](https://windowsforum.com/news/windows-11-25h2-notepad-upgrade-tabs-markdown-session-restore-copilot.428589/) |
| Feature creep and speed | People fear slower start-up; one says tabbed Notepad is already slower than Notepad++. | [AlternativeTo, 2025](https://alternativeto.net/news/2025/5/notepad-for-windows-11-adds-text-formatting-markdown-support-and-new-toolbar) |
| Formatting breaks a habit | People paste into Notepad to strip formatting. | same |
| Security cost of Markdown | CVE-2026-20841, rated 8.8: a link in a crafted Markdown file could run code. Patched in February 2026. | [Windows Latest, 2026](https://www.windowslatest.com/2026/02/12/microsoft-confirms-8-8-rated-security-issue-in-windows-11-notepad-due-to-modernization-efforts-patch-tuesday-fix-rolling-out/) |
| Session restore leaks | Text from a password-protected archive reappeared on the next launch. | [Computer Diaries, 2025](https://computerdiaries.substack.com/p/after-windows-11-upgrade-notepad) |
| Still no syntax colours or text tools | | [HN 2022](https://news.ycombinator.com/item?id=33189777) |

## What people praise elsewhere

- Sublime Text: instant start, low memory, a 5.5-million-line file edited without trouble, unsaved buffers restored, a minimap, a polished default look. ([HN 2022](https://news.ycombinator.com/item?id=33189777), [HN 2017](https://news.ycombinator.com/item?id=14918288))
- VS Code: autosave with hot exit, strong multi-cursor, a Markdown preview pane. The same threads call it slow to start, too much like an IDE, and poor on files in the tens of megabytes. ([HN 2024](https://news.ycombinator.com/item?id=42019586), [HN 2024](https://news.ycombinator.com/item?id=39854725))
- Notepad3: the classic Notepad feel plus syntax colours, regex and a dark theme, in one file that needs no install. ([HN 2022](https://news.ycombinator.com/item?id=33189777))

## Said often, not confirmed on a page I opened

- Notepad++ slows down on large files with word wrap or very long lines.
- Its toolbar icons are jagged at 150 to 200% scaling.
- Windows high-contrast mode is not supported in Notepad++.
- Windows Notepad can take seconds to launch on old hardware when it restores a session.
- MarkdownViewer++ is a popular preview plugin.

## The gaps, in one list

1. Saving: no autosave in Notepad++ without a plugin, and the session backup has cost people their work.
2. Trust: an updater that was compromised, an installer that needs administrator rights, and in Windows Notepad an assistant and a sign-in nobody asked for.
3. Looks: a dated toolbar, blurry text on mixed-DPI set-ups, dark mode that stops at plugin dialogs, colour schemes that are painful to make.
4. Everyday tools that live in plugins: JSON and XML formatting, Base64 and URL encoding, compare, autosave.
5. Many tabs: no groups, slow start with hundreds of them.
6. Finding things: no match markers on the scrollbar.
7. Accessibility: screen readers miss search results.
8. Windows Notepad still has no syntax colours, regex or line tools.
