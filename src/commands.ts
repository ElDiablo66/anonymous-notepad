// Every action the app can take, the menus that list them and the keys that run them.

import { startCompletion } from "@codemirror/autocomplete";
import {
  copyLineDown,
  cursorMatchingBracket,
  deleteLine,
  indentLess,
  indentMore,
  insertBlankLine,
  moveLineDown,
  moveLineUp,
  redo,
  selectAll,
  toggleBlockComment,
  toggleComment,
  undo,
} from "@codemirror/commands";
import { foldAll, foldCode, unfoldAll, unfoldCode } from "@codemirror/language";
import { selectNextOccurrence, selectSelectionMatches } from "@codemirror/search";
import type { EditorView } from "@codemirror/view";
import { applySettings, focusEditor, getView, languageNames, markUnsaved, PLAIN, setLanguage } from "./editor/core";
import * as ops from "./editops";
import * as files from "./files";
import * as platform from "./platform";
import { sizes } from "./scale";
import { clearStyle, findNext, lastFind, styleSelection } from "./search";
import { neighbour, stations } from "./themes";
import {
  activeDoc,
  ask,
  type Eol,
  type FindTab,
  get,
  patchDoc,
  type PickItem,
  set,
  setSetting,
  type Settings,
  type SheetName,
  type SidePanel,
  toast,
} from "./store";
import {
  base64Decode,
  base64Encode,
  caseOps,
  dateTimeIso,
  dateTimeLong,
  dateTimeShort,
  formatJson,
  lineOps,
  minifyJson,
  spacesToTabs,
  splitLines,
  tabsToSpaces,
} from "./textops";

export interface Command {
  id: string;
  title: string;
  keys?: string;
  /** Only runs from the keyboard while the editor has focus. */
  editorOnly?: boolean;
  checked?: () => boolean;
  run: () => void | Promise<void>;
}

export type MenuItem =
  | string
  | "-"
  | { label: string; items: MenuItem[] | (() => MenuItem[]) }
  | { label: string; checked?: boolean; run: () => void | Promise<void> };

export interface Menu {
  label: string;
  items: MenuItem[];
}

const registry = new Map<string, Command>();

function add(command: Command): void {
  registry.set(command.id, command);
}

function inEditor(action: (view: EditorView) => unknown): () => void {
  return () => {
    const view = getView();
    if (!view) return;
    action(view);
    view.focus();
  };
}

function active(): string {
  return get().activeId;
}

/** Find and go-to belong to the viewer's own boxes while a large file is on screen. */
function viewerTakes(what: "find" | "goto"): boolean {
  if (!activeDoc()?.big) return false;
  window.dispatchEvent(new CustomEvent("big-viewer-focus", { detail: what }));
  return true;
}

function openFind(tab: FindTab): void {
  if (tab === "find" && viewerTakes("find")) return;
  set((s) => ({ bottom: "find", findTab: tab, findNonce: s.findNonce + 1 }));
}

function toggleSide(panel: SidePanel): void {
  set((s) => ({ side: s.side === panel ? "none" : panel }));
}

function openSheet(sheet: SheetName): void {
  set({ sheet });
}

function toggleSetting(key: keyof Settings): void {
  const settings = get().settings;
  setSetting(key, !settings[key] as never);
  applySettings();
}

async function copy(text: string, label: string): Promise<void> {
  if (!text) return;
  await navigator.clipboard.writeText(text);
  toast(`${label} copied`);
}

function folderOf(path: string): string {
  return path.replace(/[\\/][^\\/]*$/, "");
}

function switchTab(offset: number): void {
  const { docs, activeId } = get();
  const index = docs.findIndex((doc) => doc.id === activeId);
  if (index < 0) return;
  files.activate(docs[(index + offset + docs.length) % docs.length].id);
}

function moveTab(offset: number): void {
  const { docs, activeId } = get();
  const index = docs.findIndex((doc) => doc.id === activeId);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= docs.length) return;
  const next = [...docs];
  [next[index], next[target]] = [next[target], next[index]];
  set({ docs: next });
}

function zoom(delta: number): void {
  const size = delta === 0 ? 14 : Math.max(8, Math.min(40, get().settings.fontSize + delta));
  setSetting("fontSize", size);
  getView()?.requestMeasure();
}

function setEol(eol: Eol): void {
  const doc = activeDoc();
  if (!doc || doc.eol === eol) return;
  patchDoc(doc.id, { eol });
  markUnsaved(doc.id);
}

function convertEncoding(encoding: string, bom: boolean): void {
  const doc = activeDoc();
  if (!doc || (doc.encoding === encoding && doc.bom === bom)) return;
  patchDoc(doc.id, { encoding, bom });
  markUnsaved(doc.id);
}

export const encodings: { label: string; name: string }[] = [
  { label: "UTF-8", name: "UTF-8" },
  { label: "UTF-16 LE", name: "UTF-16LE" },
  { label: "UTF-16 BE", name: "UTF-16BE" },
  { label: "Western European (Windows-1252)", name: "windows-1252" },
  { label: "Western European (ISO-8859-15)", name: "ISO-8859-15" },
  { label: "Central European (Windows-1250)", name: "windows-1250" },
  { label: "Central European (ISO-8859-2)", name: "ISO-8859-2" },
  { label: "Cyrillic (Windows-1251)", name: "windows-1251" },
  { label: "Cyrillic (KOI8-R)", name: "KOI8-R" },
  { label: "Cyrillic (KOI8-U)", name: "KOI8-U" },
  { label: "Cyrillic (IBM 866)", name: "IBM866" },
  { label: "Greek (Windows-1253)", name: "windows-1253" },
  { label: "Turkish (Windows-1254)", name: "windows-1254" },
  { label: "Hebrew (Windows-1255)", name: "windows-1255" },
  { label: "Arabic (Windows-1256)", name: "windows-1256" },
  { label: "Baltic (Windows-1257)", name: "windows-1257" },
  { label: "Vietnamese (Windows-1258)", name: "windows-1258" },
  { label: "Thai (Windows-874)", name: "windows-874" },
  { label: "Japanese (Shift JIS)", name: "Shift_JIS" },
  { label: "Japanese (EUC-JP)", name: "EUC-JP" },
  { label: "Chinese simplified (GBK)", name: "GBK" },
  { label: "Chinese simplified (GB18030)", name: "gb18030" },
  { label: "Chinese traditional (Big5)", name: "Big5" },
  { label: "Korean (EUC-KR)", name: "EUC-KR" },
  { label: "Mac Roman", name: "macintosh" },
];

export function encodingLabel(name: string, bom: boolean): string {
  if (name === "UTF-8") return bom ? "UTF-8 BOM" : "UTF-8";
  if (name === "UTF-16LE") return "UTF-16 LE";
  if (name === "UTF-16BE") return "UTF-16 BE";
  if (name === "windows-1252") return "ANSI";
  return name;
}

export function pickLanguage(): void {
  const id = active();
  const items: PickItem[] = [PLAIN, ...languageNames].map((name) => ({
    label: name,
    run: () => void setLanguage(id, name),
  }));
  set({ picker: { placeholder: "Choose a language", items } });
}

export function pickEncoding(): void {
  const id = active();
  const items: PickItem[] = encodings.map((encoding) => ({
    label: encoding.label,
    hint: "Reopen the file as",
    run: () => void files.reopenWithEncoding(id, encoding.name),
  }));
  set({ picker: { placeholder: "Reopen with encoding", items } });
}

export function pickCommand(): void {
  const items: PickItem[] = [...registry.values()].map((command) => ({
    label: command.title,
    hint: command.keys,
    run: () => void command.run(),
  }));
  set({ picker: { placeholder: "Run a command", items } });
}

async function goTo(): Promise<void> {
  if (viewerTakes("goto")) return;
  const { cursor } = get();
  const answer = await ask({
    title: "Go to line",
    message: `Line 1 to ${cursor.lines}. Add a column with a colon, such as 120:8.`,
    input: String(cursor.line),
    buttons: [
      { label: "Go", value: "ok", primary: true },
      { label: "Cancel", value: "cancel" },
    ],
  });
  if (answer.button !== "ok") return;
  const [line, column] = answer.input.split(":").map((part) => Number.parseInt(part.trim(), 10));
  if (Number.isFinite(line)) ops.gotoLine(line, Number.isFinite(column) ? column - 1 : 0);
}

async function splitLongLines(): Promise<void> {
  const answer = await ask({
    title: "Split lines",
    message: "Break lines longer than this many characters at spaces.",
    input: "80",
    buttons: [
      { label: "Split", value: "ok", primary: true },
      { label: "Cancel", value: "cancel" },
    ],
  });
  const width = Number.parseInt(answer.input, 10);
  if (answer.button === "ok" && width > 0) ops.runLineOp((lines) => splitLines(lines, width));
}

async function paste(): Promise<void> {
  try {
    ops.insertText((await navigator.clipboard.readText()).replace(/\r\n?/g, "\n"));
  } catch {
    toast("Paste with Ctrl+V; the clipboard is not readable from the menu");
  }
}

function findSelected(backward: boolean): void {
  const text = ops.selectedText();
  if (text && !text.includes("\n")) lastFind.what = text;
  const outcome = findNext(lastFind, backward);
  if (outcome === "none") toast(lastFind.what ? `"${lastFind.what}" was not found` : "Nothing to search for yet");
}

// File

add({ id: "file.new", title: "New", keys: "Ctrl+N", run: () => void files.newDoc() });
add({ id: "file.open", title: "Open…", keys: "Ctrl+O", run: files.openDialog });
add({
  id: "file.openFolder",
  title: "Open folder as workspace…",
  run: async () => {
    const folder = await platform.pickFolder();
    if (folder) set({ workspace: folder, side: "folder" });
    else if (!platform.desktop) toast("Opening folders needs the desktop app");
  },
});
add({ id: "file.reload", title: "Reload from disk", keys: "Ctrl+R", run: () => files.reload(active()) });
add({ id: "file.save", title: "Save", keys: "Ctrl+S", run: async () => void (await files.save(active())) });
add({ id: "file.saveAs", title: "Save as…", keys: "Ctrl+Alt+S", run: async () => void (await files.saveAs(active())) });
add({ id: "file.saveCopy", title: "Save a copy as…", run: () => files.saveCopy(active()) });
add({ id: "file.saveAll", title: "Save all", keys: "Ctrl+Shift+S", run: files.saveAll });
add({ id: "file.rename", title: "Rename…", run: files.renameActive });
add({ id: "file.trash", title: "Move to Recycle Bin", run: files.trashActive });
add({ id: "file.close", title: "Close", keys: "Ctrl+W", run: async () => void (await files.closeDoc(active())) });
add({ id: "file.closeAll", title: "Close all", keys: "Ctrl+Shift+W", run: () => files.closeMany(get().docs.map((d) => d.id)) });
add({
  id: "file.closeOthers",
  title: "Close all but this one",
  run: () => files.closeMany(get().docs.filter((d) => d.id !== active()).map((d) => d.id)),
});
add({
  id: "file.closeUnpinned",
  title: "Close all but pinned",
  run: () => files.closeMany(get().docs.filter((d) => !d.pinned).map((d) => d.id)),
});
add({
  id: "file.closeLeft",
  title: "Close all to the left",
  run: () => {
    const { docs } = get();
    const index = docs.findIndex((d) => d.id === active());
    return files.closeMany(docs.slice(0, index).map((d) => d.id));
  },
});
add({
  id: "file.closeRight",
  title: "Close all to the right",
  run: () => {
    const { docs } = get();
    const index = docs.findIndex((d) => d.id === active());
    return files.closeMany(docs.slice(index + 1).map((d) => d.id));
  },
});
add({
  id: "file.closeUnchanged",
  title: "Close all unchanged",
  run: () => files.closeMany(get().docs.filter((d) => !d.dirty).map((d) => d.id)),
});
add({ id: "file.restoreClosed", title: "Reopen closed file", keys: "Ctrl+Shift+T", run: files.restoreClosed });
add({ id: "file.openAllRecent", title: "Open all recent files", run: () => files.openPaths([...get().recent].reverse()) });
add({ id: "file.clearRecent", title: "Empty the recent files list", run: () => set({ recent: [] }) });
add({
  id: "file.reveal",
  title: "Show in Explorer",
  run: async () => {
    const path = activeDoc()?.path;
    if (path) await platform.reveal(path);
    else toast("This tab has no file on disk yet");
  },
});
add({
  id: "file.cmd",
  title: "Open Command Prompt here",
  run: async () => {
    const path = activeDoc()?.path;
    if (path) await platform.openTerminal(folderOf(path), "cmd");
    else toast("This tab has no file on disk yet");
  },
});
add({
  id: "file.powershell",
  title: "Open PowerShell here",
  run: async () => {
    const path = activeDoc()?.path;
    if (path) await platform.openTerminal(folderOf(path), "powershell");
    else toast("This tab has no file on disk yet");
  },
});
add({ id: "file.exit", title: "Exit", keys: "Alt+F4", run: async () => (await files.saveSession(), platform.closeWindow()) });

// Edit

add({ id: "edit.undo", title: "Undo", keys: "Ctrl+Z", editorOnly: true, run: inEditor(undo) });
add({ id: "edit.redo", title: "Redo", keys: "Ctrl+Y", editorOnly: true, run: inEditor(redo) });
add({ id: "edit.cut", title: "Cut", run: inEditor(() => document.execCommand("cut")) });
add({ id: "edit.copy", title: "Copy", run: inEditor(() => document.execCommand("copy")) });
add({ id: "edit.paste", title: "Paste", run: paste });
add({ id: "edit.delete", title: "Delete", run: () => ops.insertText("") });
add({ id: "edit.selectAll", title: "Select all", run: inEditor(selectAll) });
add({ id: "edit.dateShort", title: "Date and time, short", run: () => ops.insertText(dateTimeShort(new Date())) });
add({ id: "edit.dateLong", title: "Date and time, long", run: () => ops.insertText(dateTimeLong(new Date())) });
add({ id: "edit.dateIso", title: "Date and time, sortable", run: () => ops.insertText(dateTimeIso(new Date())) });
add({ id: "edit.indent", title: "Increase line indent", run: inEditor(indentMore) });
add({ id: "edit.outdent", title: "Decrease line indent", run: inEditor(indentLess) });
add({ id: "edit.duplicateLine", title: "Duplicate line", keys: "Ctrl+D", editorOnly: true, run: inEditor(copyLineDown) });
add({ id: "edit.deleteLine", title: "Delete line", keys: "Ctrl+Shift+L", editorOnly: true, run: inEditor(deleteLine) });
add({ id: "edit.moveLineUp", title: "Move line up", keys: "Ctrl+Shift+ArrowUp", editorOnly: true, run: inEditor(moveLineUp) });
add({ id: "edit.moveLineDown", title: "Move line down", keys: "Ctrl+Shift+ArrowDown", editorOnly: true, run: inEditor(moveLineDown) });
add({ id: "edit.joinLines", title: "Join lines", keys: "Ctrl+J", editorOnly: true, run: () => ops.runLineOp(lineOps.join) });
add({ id: "edit.splitLines", title: "Split lines…", run: splitLongLines });
add({ id: "edit.blankAbove", title: "Insert blank line above", keys: "Ctrl+Alt+Enter", editorOnly: true, run: ops.insertLineAbove });
add({ id: "edit.blankBelow", title: "Insert blank line below", keys: "Ctrl+Alt+Shift+Enter", editorOnly: true, run: inEditor(insertBlankLine) });

const sorts: [string, string, keyof typeof lineOps][] = [
  ["sortAsc", "Sort lines A to Z", "sortAsc"],
  ["sortDesc", "Sort lines Z to A", "sortDesc"],
  ["sortAscNoCase", "Sort lines A to Z, ignoring case", "sortAscNoCase"],
  ["sortDescNoCase", "Sort lines Z to A, ignoring case", "sortDescNoCase"],
  ["sortLocaleAsc", "Sort lines in locale order, ascending", "sortLocaleAsc"],
  ["sortLocaleDesc", "Sort lines in locale order, descending", "sortLocaleDesc"],
  ["sortLengthAsc", "Sort lines by length, shortest first", "sortLengthAsc"],
  ["sortLengthDesc", "Sort lines by length, longest first", "sortLengthDesc"],
  ["sortIntAsc", "Sort lines as whole numbers, ascending", "sortIntAsc"],
  ["sortIntDesc", "Sort lines as whole numbers, descending", "sortIntDesc"],
  ["sortDotAsc", "Sort lines as decimals (dot), ascending", "sortDotAsc"],
  ["sortDotDesc", "Sort lines as decimals (dot), descending", "sortDotDesc"],
  ["sortCommaAsc", "Sort lines as decimals (comma), ascending", "sortCommaAsc"],
  ["sortCommaDesc", "Sort lines as decimals (comma), descending", "sortCommaDesc"],
  ["reverse", "Reverse line order", "reverse"],
  ["shuffle", "Shuffle lines", "shuffle"],
  ["removeDuplicates", "Remove duplicate lines", "removeDuplicates"],
  ["removeConsecutiveDuplicates", "Remove duplicate lines that follow each other", "removeConsecutiveDuplicates"],
  ["removeEmpty", "Remove empty lines", "removeEmpty"],
  ["removeBlank", "Remove empty lines, including blank ones", "removeBlank"],
  ["trimTrailing", "Trim trailing space", "trimTrailing"],
  ["trimLeading", "Trim leading space", "trimLeading"],
  ["trimBoth", "Trim leading and trailing space", "trimBoth"],
  ["eolToSpace", "Line breaks to spaces", "eolToSpace"],
  ["trimAndJoin", "Trim both and line breaks to spaces", "trimAndJoin"],
];
for (const [id, title, op] of sorts) add({ id: `lines.${id}`, title, run: () => ops.runLineOp(lineOps[op]) });

add({ id: "lines.tabsToSpaces", title: "Tabs to spaces", run: () => ops.runLineOp((l) => tabsToSpaces(l, get().settings.tabSize)) });
add({ id: "lines.spacesToTabsAll", title: "Spaces to tabs, everywhere", run: () => ops.runLineOp((l) => spacesToTabs(l, get().settings.tabSize, false)) });
add({ id: "lines.spacesToTabsLeading", title: "Spaces to tabs, leading only", run: () => ops.runLineOp((l) => spacesToTabs(l, get().settings.tabSize, true)) });

const cases: [string, string, string?][] = [
  ["upper", "UPPERCASE", "Ctrl+Shift+U"],
  ["lower", "lowercase", "Ctrl+U"],
  ["proper", "Proper Case"],
  ["properBlend", "Proper Case, keep other capitals"],
  ["sentence", "Sentence case"],
  ["sentenceBlend", "Sentence case, keep other capitals"],
  ["invert", "iNVERT cASE"],
  ["random", "rAnDoM cAsE"],
];
for (const [id, title, keys] of cases) add({ id: `case.${id}`, title, keys, editorOnly: true, run: () => ops.runCaseOp(caseOps[id]) });

add({ id: "edit.toggleComment", title: "Toggle line comment", keys: "Ctrl+Q", editorOnly: true, run: inEditor(toggleComment) });
add({ id: "edit.blockComment", title: "Toggle block comment", keys: "Ctrl+Shift+Q", editorOnly: true, run: inEditor(toggleBlockComment) });
add({ id: "edit.complete", title: "Show completions", keys: "Ctrl+Space", editorOnly: true, run: inEditor(startCompletion) });
add({ id: "edit.selectNext", title: "Add next occurrence to selection", keys: "Ctrl+Alt+D", editorOnly: true, run: inEditor(selectNextOccurrence) });
add({ id: "edit.selectAllMatches", title: "Select every occurrence", keys: "Ctrl+Alt+A", editorOnly: true, run: inEditor(selectSelectionMatches) });
add({ id: "edit.column", title: "Column editor…", keys: "Alt+C", run: () => openSheet("column") });
add({
  id: "edit.readOnly",
  title: "Read-only for this tab",
  checked: () => activeDoc()?.readOnly ?? false,
  run: () => {
    const doc = activeDoc();
    if (!doc) return;
    patchDoc(doc.id, { readOnly: !doc.readOnly });
    applySettings();
  },
});
add({ id: "edit.copyPath", title: "Copy file path", run: () => copy(activeDoc()?.path ?? "", "Path") });
add({ id: "edit.copyName", title: "Copy file name", run: () => copy(activeDoc()?.name ?? "", "Name") });
add({ id: "edit.copyDir", title: "Copy folder path", run: () => copy(folderOf(activeDoc()?.path ?? ""), "Folder") });
add({
  id: "edit.copyAllPaths",
  title: "Copy every open file path",
  run: () => copy(get().docs.map((d) => d.path ?? d.name).join("\n"), "Paths"),
});
add({
  id: "edit.searchWeb",
  title: "Search the web for the selection",
  run: async () => {
    const text = ops.selectedText().trim();
    if (text) await platform.openUrl(get().settings.searchEngine + encodeURIComponent(text));
    else toast("Select some text first");
  },
});

// Search

add({ id: "search.find", title: "Find…", keys: "Ctrl+F", run: () => openFind("find") });
add({ id: "search.replace", title: "Replace…", keys: "Ctrl+H", run: () => openFind("replace") });
add({ id: "search.findInFiles", title: "Find in files…", keys: "Ctrl+Shift+F", run: () => openFind("files") });
add({ id: "search.replaceInFiles", title: "Replace in files…", keys: "Ctrl+Shift+H", run: () => openFind("replaceFiles") });
add({ id: "search.mark", title: "Mark…", keys: "Ctrl+M", run: () => openFind("mark") });
add({
  id: "search.next",
  title: "Find next",
  keys: "F3",
  run: () => {
    if (findNext(lastFind) === "none") toast(lastFind.what ? `"${lastFind.what}" was not found` : "Nothing to search for yet");
  },
});
add({
  id: "search.previous",
  title: "Find previous",
  keys: "Shift+F3",
  run: () => {
    if (findNext(lastFind, true) === "none") toast(lastFind.what ? `"${lastFind.what}" was not found` : "Nothing to search for yet");
  },
});
add({ id: "search.selectedNext", title: "Find the selection, next", keys: "Ctrl+F3", run: () => findSelected(false) });
add({ id: "search.selectedPrevious", title: "Find the selection, previous", keys: "Ctrl+Shift+F3", run: () => findSelected(true) });
add({ id: "search.goto", title: "Go to line…", keys: "Ctrl+G", run: goTo });
add({ id: "search.brace", title: "Go to matching bracket", keys: "Ctrl+B", editorOnly: true, run: inEditor(cursorMatchingBracket) });
add({ id: "search.results", title: "Search results", keys: "F7", run: () => set((s) => ({ bottom: s.bottom === "results" ? "none" : "results" })) });
add({ id: "bookmark.toggle", title: "Toggle bookmark", keys: "Ctrl+F2", run: ops.toggleBookmark });
add({ id: "bookmark.next", title: "Next bookmark", keys: "F2", run: () => ops.jumpBookmark(1) });
add({ id: "bookmark.previous", title: "Previous bookmark", keys: "Shift+F2", run: () => ops.jumpBookmark(-1) });
add({ id: "bookmark.clear", title: "Clear all bookmarks", run: ops.clearBookmarks });
add({ id: "bookmark.cut", title: "Cut bookmarked lines", run: () => ops.copyBookmarked(true) });
add({ id: "bookmark.copy", title: "Copy bookmarked lines", run: () => ops.copyBookmarked(false) });
add({ id: "bookmark.remove", title: "Remove bookmarked lines", run: () => ops.removeBookmarked(false) });
add({ id: "bookmark.keep", title: "Remove lines without a bookmark", run: () => ops.removeBookmarked(true) });
add({ id: "bookmark.invert", title: "Invert bookmarks", run: ops.invertBookmarks });
for (const style of [1, 2, 3, 4, 5]) {
  add({
    id: `style.mark${style}`,
    title: `Colour every occurrence, colour ${style}`,
    run: () => {
      const total = styleSelection(style);
      toast(total ? `${total} coloured` : "Put the cursor on a word or select text first");
    },
  });
  add({ id: `style.clear${style}`, title: `Clear colour ${style}`, run: () => clearStyle(style) });
}
add({ id: "style.clearAll", title: "Clear every colour", run: () => clearStyle(-1) });

// View

add({ id: "view.onTop", title: "Always on top", checked: () => get().onTop, run: async () => {
  const onTop = !get().onTop;
  set({ onTop });
  await platform.setAlwaysOnTop(onTop);
} });
add({ id: "view.fullscreen", title: "Full screen", keys: "F11", checked: () => get().fullscreen, run: async () => {
  const fullscreen = !get().fullscreen;
  set({ fullscreen });
  await platform.setFullscreen(fullscreen);
} });
add({ id: "view.zen", title: "Distraction free", keys: "F12", checked: () => get().zen, run: () => set((s) => ({ zen: !s.zen })) });
add({ id: "view.wrap", title: "Word wrap", keys: "Alt+Z", checked: () => get().settings.wordWrap, run: () => toggleSetting("wordWrap") });
add({ id: "view.whitespace", title: "Show spaces and tabs", checked: () => get().settings.showWhitespace, run: () => toggleSetting("showWhitespace") });
add({ id: "view.guides", title: "Show indent guides", checked: () => get().settings.indentGuides, run: () => toggleSetting("indentGuides") });
add({ id: "view.lineNumbers", title: "Show line numbers", checked: () => get().settings.lineNumbers, run: () => toggleSetting("lineNumbers") });
add({ id: "view.minimap", title: "Document map", checked: () => get().settings.minimap, run: () => toggleSetting("minimap") });
add({ id: "view.zoomIn", title: "Zoom in", keys: "Ctrl+=", run: () => zoom(1) });
add({ id: "view.zoomOut", title: "Zoom out", keys: "Ctrl+-", run: () => zoom(-1) });
add({ id: "view.zoomReset", title: "Reset zoom", keys: "Ctrl+0", run: () => zoom(0) });
add({ id: "view.foldAll", title: "Fold all", keys: "Alt+0", run: inEditor(foldAll) });
add({ id: "view.unfoldAll", title: "Unfold all", keys: "Alt+Shift+0", run: inEditor(unfoldAll) });
add({ id: "view.fold", title: "Fold this block", keys: "Ctrl+Alt+F", editorOnly: true, run: inEditor(foldCode) });
add({ id: "view.unfold", title: "Unfold this block", keys: "Ctrl+Alt+Shift+F", editorOnly: true, run: inEditor(unfoldCode) });
add({ id: "view.folder", title: "Folder workspace", keys: "Ctrl+Alt+W", checked: () => get().side === "folder", run: () => toggleSide("folder") });
add({ id: "view.docs", title: "Document list", checked: () => get().side === "docs", run: () => toggleSide("docs") });
add({ id: "view.functions", title: "Function list", checked: () => get().side === "functions", run: () => toggleSide("functions") });
add({ id: "view.summary", title: "Summary…", run: () => openSheet("summary") });
add({ id: "view.palette", title: "Command list…", keys: "Ctrl+Shift+P", run: pickCommand });
add({ id: "tab.next", title: "Next tab", keys: "Ctrl+Tab", run: () => switchTab(1) });
add({ id: "tab.previous", title: "Previous tab", keys: "Ctrl+Shift+Tab", run: () => switchTab(-1) });
add({ id: "tab.nextPage", title: "Next tab", keys: "Ctrl+PageDown", run: () => switchTab(1) });
add({ id: "tab.previousPage", title: "Previous tab", keys: "Ctrl+PageUp", run: () => switchTab(-1) });
add({ id: "tab.forward", title: "Move tab right", keys: "Ctrl+Shift+PageDown", run: () => moveTab(1) });
add({ id: "tab.backward", title: "Move tab left", keys: "Ctrl+Shift+PageUp", run: () => moveTab(-1) });
add({ id: "tab.first", title: "First tab", run: () => files.activate(get().docs[0].id) });
add({ id: "tab.last", title: "Last tab", run: () => files.activate(get().docs[get().docs.length - 1].id) });
add({
  id: "tab.pin",
  title: "Pin tab",
  checked: () => activeDoc()?.pinned ?? false,
  run: () => {
    const doc = activeDoc();
    if (!doc) return;
    patchDoc(doc.id, { pinned: !doc.pinned });
    // Pinned tabs sit together at the left.
    const docs = get().docs;
    set({ docs: [...docs.filter((d) => d.pinned), ...docs.filter((d) => !d.pinned)] });
  },
});
add({
  id: "tab.sortName",
  title: "Sort tabs by name",
  run: () => set((s) => ({ docs: [...s.docs].sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name)) })),
});
for (const color of [0, 1, 2, 3, 4, 5]) {
  add({
    id: `tab.color${color}`,
    title: color ? `Tab colour ${color}` : "Remove tab colour",
    checked: () => activeDoc()?.color === color && color !== 0,
    run: () => patchDoc(active(), { color }),
  });
}
for (let n = 1; n <= 9; n += 1) {
  add({
    id: `tab.go${n}`,
    title: `Tab ${n}`,
    keys: `Ctrl+${n}`,
    run: () => {
      const doc = get().docs[n - 1];
      if (doc) files.activate(doc.id);
    },
  });
}

// Encoding and line endings

add({ id: "eol.crlf", title: "Windows line endings (CR LF)", checked: () => activeDoc()?.eol === "CRLF", run: () => setEol("CRLF") });
add({ id: "eol.lf", title: "Unix line endings (LF)", checked: () => activeDoc()?.eol === "LF", run: () => setEol("LF") });
add({ id: "eol.cr", title: "Classic Mac line endings (CR)", checked: () => activeDoc()?.eol === "CR", run: () => setEol("CR") });

const conversions: [string, string, string, boolean][] = [
  ["utf8", "UTF-8", "UTF-8", false],
  ["utf8bom", "UTF-8 with BOM", "UTF-8", true],
  ["utf16le", "UTF-16 LE", "UTF-16LE", true],
  ["utf16be", "UTF-16 BE", "UTF-16BE", true],
  ["ansi", "ANSI (Windows-1252)", "windows-1252", false],
];
for (const [id, label, name, bom] of conversions) {
  add({
    id: `encoding.${id}`,
    title: `Convert to ${label}`,
    checked: () => activeDoc()?.encoding === name && activeDoc()?.bom === bom,
    run: () => convertEncoding(name, bom),
  });
}
add({ id: "encoding.reopen", title: "Reopen with encoding…", run: pickEncoding });
add({ id: "language.pick", title: "Choose language…", keys: "Ctrl+Shift+G", run: pickLanguage });
add({ id: "language.plain", title: "Plain text", checked: () => activeDoc()?.lang === PLAIN, run: () => void setLanguage(active(), PLAIN) });

// Tools and settings

function jsonIndent(): string | number {
  const { insertSpaces, tabSize } = get().settings;
  return insertSpaces ? tabSize : "\t";
}

add({ id: "tools.jsonFormat", title: "Format JSON", keys: "Ctrl+Alt+J", run: () => ops.transformText((text) => formatJson(text, jsonIndent()), "Not valid JSON") });
add({ id: "tools.jsonMinify", title: "Minify JSON", run: () => ops.transformText(minifyJson, "Not valid JSON") });
add({ id: "tools.base64Encode", title: "Base64 encode", run: () => ops.transformText(base64Encode, "Cannot encode") });
add({ id: "tools.base64Decode", title: "Base64 decode", run: () => ops.transformText(base64Decode, "Not Base64 text") });
add({ id: "tools.urlEncode", title: "URL encode", run: () => ops.transformText(encodeURIComponent, "Cannot encode") });
add({ id: "tools.urlDecode", title: "URL decode", run: () => ops.transformText(decodeURIComponent, "Not URL-encoded text") });

function tuneTo(step: 1 | -1): void {
  const station = neighbour(get().settings.theme, step);
  setSetting("theme", station.id);
  toast(`${station.frequency.toFixed(1)} · ${station.name}`);
}

add({ id: "theme.next", title: "Next theme station", keys: "Ctrl+Alt+T", run: () => tuneTo(1) });
add({ id: "theme.previous", title: "Previous theme station", keys: "Ctrl+Alt+Shift+T", run: () => tuneTo(-1) });
for (const station of stations) {
  add({
    id: `theme.${station.id}`,
    title: `Theme: ${station.name}`,
    checked: () => get().settings.theme === station.id,
    run: () => setSetting("theme", station.id),
  });
}
add({ id: "size.fit", title: "Interface size: fit the window", checked: () => get().settings.uiSize === null, run: () => setSetting("uiSize", null) });
for (const size of sizes) {
  add({
    id: `size.${Math.round(size * 100)}`,
    title: `Interface size: ${Math.round(size * 100)}%`,
    checked: () => get().settings.uiSize === size,
    run: () => setSetting("uiSize", size),
  });
}
add({ id: "view.toolbar", title: "Show toolbar", checked: () => get().settings.toolbar, run: () => toggleSetting("toolbar") });

add({ id: "tools.hash", title: "Hashes: MD5, SHA-1, SHA-256, SHA-512…", run: () => openSheet("hash") });
add({ id: "settings.preferences", title: "Preferences…", keys: "Ctrl+,", run: () => openSheet("preferences") });
add({ id: "settings.shortcuts", title: "Keyboard shortcuts…", run: () => openSheet("shortcuts") });
add({ id: "help.about", title: "About Anonymous Notepad", keys: "F1", run: () => openSheet("about") });

function recentItems(): MenuItem[] {
  const recent = get().recent;
  if (!recent.length) return [{ label: "No recent files", run: () => undefined }];
  return [
    ...recent.map((path) => ({ label: path, run: () => files.openPaths([path]) })),
    "-",
    "file.openAllRecent",
    "file.clearRecent",
  ];
}

function languageGroups(): MenuItem[] {
  const groups = new Map<string, string[]>();
  for (const name of languageNames) {
    const letter = /[a-z]/i.test(name[0]) ? name[0].toUpperCase() : "#";
    groups.set(letter, [...(groups.get(letter) ?? []), name]);
  }
  const current = activeDoc()?.lang;
  return [...groups.entries()].map(([letter, names]) => ({
    label: letter,
    items: names.map((name) => ({ label: name, checked: name === current, run: () => void setLanguage(active(), name) })),
  }));
}

export const menus: Menu[] = [
  {
    label: "File",
    items: [
      "file.new",
      "file.open",
      "file.openFolder",
      { label: "Open containing folder", items: ["file.reveal", "file.cmd", "file.powershell"] },
      "file.reload",
      "-",
      "file.save",
      "file.saveAs",
      "file.saveCopy",
      "file.saveAll",
      "file.rename",
      "-",
      "file.close",
      "file.closeAll",
      {
        label: "Close several",
        items: ["file.closeOthers", "file.closeUnpinned", "file.closeLeft", "file.closeRight", "file.closeUnchanged"],
      },
      "file.trash",
      "-",
      "file.restoreClosed",
      { label: "Recent files", items: recentItems },
      "-",
      "file.exit",
    ],
  },
  {
    label: "Edit",
    items: [
      "edit.undo",
      "edit.redo",
      "-",
      "edit.cut",
      "edit.copy",
      "edit.paste",
      "edit.delete",
      "edit.selectAll",
      "-",
      { label: "Insert", items: ["edit.dateShort", "edit.dateLong", "edit.dateIso", "-", "edit.blankAbove", "edit.blankBelow"] },
      { label: "Copy to clipboard", items: ["edit.copyPath", "edit.copyName", "edit.copyDir", "edit.copyAllPaths"] },
      { label: "Indent", items: ["edit.indent", "edit.outdent"] },
      { label: "Convert case", items: cases.map(([id]) => `case.${id}`) },
      {
        label: "Line operations",
        items: [
          "edit.duplicateLine",
          "edit.deleteLine",
          "edit.moveLineUp",
          "edit.moveLineDown",
          "edit.joinLines",
          "edit.splitLines",
          "-",
          ...sorts.slice(0, 16).map(([id]) => `lines.${id}`),
          "-",
          "lines.removeDuplicates",
          "lines.removeConsecutiveDuplicates",
          "lines.removeEmpty",
          "lines.removeBlank",
        ],
      },
      { label: "Comment", items: ["edit.toggleComment", "edit.blockComment"] },
      {
        label: "Blank operations",
        items: [
          "lines.trimTrailing",
          "lines.trimLeading",
          "lines.trimBoth",
          "lines.eolToSpace",
          "lines.trimAndJoin",
          "-",
          "lines.tabsToSpaces",
          "lines.spacesToTabsAll",
          "lines.spacesToTabsLeading",
        ],
      },
      { label: "Line endings", items: ["eol.crlf", "eol.lf", "eol.cr"] },
      { label: "Multi-select", items: ["edit.selectNext", "edit.selectAllMatches"] },
      "-",
      "edit.complete",
      "edit.column",
      "edit.searchWeb",
      "edit.readOnly",
    ],
  },
  {
    label: "Search",
    items: [
      "search.find",
      "search.findInFiles",
      "search.next",
      "search.previous",
      "search.selectedNext",
      "search.selectedPrevious",
      "search.replace",
      "search.replaceInFiles",
      "search.mark",
      "search.results",
      "-",
      "search.goto",
      "search.brace",
      "-",
      {
        label: "Colour occurrences",
        items: [1, 2, 3, 4, 5].map((n) => `style.mark${n}`),
      },
      { label: "Clear colours", items: [...[1, 2, 3, 4, 5].map((n) => `style.clear${n}`), "-", "style.clearAll"] },
      {
        label: "Bookmarks",
        items: [
          "bookmark.toggle",
          "bookmark.next",
          "bookmark.previous",
          "bookmark.clear",
          "-",
          "bookmark.cut",
          "bookmark.copy",
          "bookmark.remove",
          "bookmark.keep",
          "bookmark.invert",
        ],
      },
    ],
  },
  {
    label: "View",
    items: [
      "view.onTop",
      "view.fullscreen",
      "view.zen",
      "-",
      "view.wrap",
      "view.whitespace",
      "view.guides",
      "view.lineNumbers",
      "view.toolbar",
      { label: "Theme", items: [...stations.map((station) => `theme.${station.id}`), "-", "theme.next", "theme.previous"] },
      { label: "Interface size", items: ["size.fit", ...sizes.map((size) => `size.${Math.round(size * 100)}`)] },
      { label: "Text zoom", items: ["view.zoomIn", "view.zoomOut", "view.zoomReset"] },
      { label: "Fold", items: ["view.foldAll", "view.unfoldAll", "view.fold", "view.unfold"] },
      "-",
      "view.folder",
      "view.docs",
      "view.functions",
      "view.minimap",
      "-",
      {
        label: "Tab",
        items: [
          "tab.next",
          "tab.previous",
          "tab.first",
          "tab.last",
          "tab.forward",
          "tab.backward",
          "-",
          "tab.pin",
          "tab.sortName",
          "-",
          ...[1, 2, 3, 4, 5, 0].map((n) => `tab.color${n}`),
        ],
      },
      "view.summary",
      "view.palette",
    ],
  },
  {
    label: "Encoding",
    items: [...conversions.map(([id]) => `encoding.${id}`), "-", "encoding.reopen"],
  },
  {
    label: "Language",
    items: ["language.pick", "language.plain", "-", { label: "All languages", items: languageGroups }],
  },
  {
    label: "Tools",
    items: [
      "tools.jsonFormat",
      "tools.jsonMinify",
      "-",
      "tools.base64Encode",
      "tools.base64Decode",
      "tools.urlEncode",
      "tools.urlDecode",
      "-",
      "tools.hash",
      "-",
      "settings.preferences",
      "settings.shortcuts",
      "-",
      "help.about",
    ],
  },
];

export function command(id: string): Command | undefined {
  return registry.get(id);
}

export function allCommands(): Command[] {
  return [...registry.values()];
}

function describeKey(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  let key = event.key;
  if (event.code.startsWith("Key")) key = event.code.slice(3);
  else if (event.code.startsWith("Digit")) key = event.code.slice(5);
  else if (event.code === "NumpadAdd" || event.code === "Equal") key = "=";
  else if (event.code === "NumpadSubtract" || event.code === "Minus") key = "-";
  else if (event.code === "Numpad0") key = "0";
  else if (event.code === "Comma") key = ",";
  else if (event.code === "Space") key = "Space";
  if (["Control", "Shift", "Alt", "Meta"].includes(key)) return "";
  parts.push(key);
  return parts.join("+");
}

const byKey = new Map<string, Command>();
for (const entry of registry.values()) {
  if (entry.keys && !byKey.has(entry.keys)) byKey.set(entry.keys, entry);
}

// Keys the web view would otherwise act on itself (reload, print, view source, downloads).
const webViewKeys = new Set(["F5", "Ctrl+F5", "Ctrl+Shift+R", "Ctrl+P", "Ctrl+U", "Ctrl+J", "Ctrl+E", "F7"]);

/** Runs the command bound to a key press. Returns true when the key is handled and must not reach the web view. */
export function handleKey(event: KeyboardEvent): boolean {
  if (event.key === "Insert" && !event.ctrlKey && !event.shiftKey && !event.altKey) {
    set((s) => ({ overwrite: !s.overwrite }));
    return true;
  }
  const combo = describeKey(event);
  const found = combo ? byKey.get(combo) : undefined;
  const target = event.target as HTMLElement | null;
  const usable = found && found.id !== "file.exit" && (!found.editorOnly || target?.closest(".cm-editor"));
  if (!found || !usable) return webViewKeys.has(combo);
  void found.run();
  return true;
}

export { focusEditor };
