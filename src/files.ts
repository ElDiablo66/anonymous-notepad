// Opening, saving and closing documents, plus the saved session.

import { createDoc, detectLanguage, markSaved, PLAIN, removeDoc, setLanguage, show, snapshot, textOf } from "./editor/core";
import * as platform from "./platform";
import { activeDoc, ask, type Doc, type Eol, get, newId, patchDoc, set, toast } from "./store";

const closedPaths: string[] = [];
const RECENT_LIMIT = 15;

/** Files larger than this open in the read-only viewer instead of the editor. */
export const BIG_BYTES = 50 * 1024 * 1024;
/** The editor keeps the whole text in memory; the backend refuses files above this. */
export const EDITOR_LIMIT = 256 * 1024 * 1024;

/** Becomes true once the saved session is back on screen. Saving before that would write an empty or partial session over the real one. */
let sessionReady = false;
let markLoaded: () => void = () => undefined;
/** Resolves when the saved session has been restored. */
export const sessionLoaded = new Promise<void>((resolve) => {
  markLoaded = resolve;
});

/** Session entries for tabs whose files have not been read yet. */
const pendingDocs = new Map<string, SavedDoc>();
const loading = new Map<string, Promise<void>>();

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function nextUntitledName(): string {
  const used = new Set(get().docs.filter((doc) => !doc.path).map((doc) => doc.name));
  let number = 1;
  while (used.has(`new ${number}`)) number += 1;
  return `new ${number}`;
}

function blankDoc(overrides: Partial<Doc>): Doc {
  return {
    id: newId(),
    name: "",
    path: null,
    encoding: "UTF-8",
    bom: false,
    eol: "CRLF",
    lang: PLAIN,
    dirty: false,
    pinned: false,
    readOnly: false,
    mtime: null,
    color: 0,
    changedOnDisk: false,
    pending: false,
    big: null,
    ...overrides,
  };
}

function remember(path: string): void {
  const recent = [path, ...get().recent.filter((entry) => entry !== path)].slice(0, RECENT_LIMIT);
  set({ recent });
}

export function activate(id: string): void {
  if (get().docs.some((doc) => doc.id === id)) set({ activeId: id });
}

export function newDoc(text = ""): Doc {
  const doc = blankDoc({ name: nextUntitledName(), dirty: text !== "" });
  createDoc({ id: doc.id, text, saved: text === "" });
  set((s) => ({ docs: [...s.docs, doc], activeId: doc.id }));
  return doc;
}

/** Adds a tab with the given text, as if it had just been read from disk. Used by the demo. */
export async function addDoc(name: string, text: string, lang: string): Promise<string> {
  const doc = blankDoc({ name, lang });
  createDoc({ id: doc.id, text });
  const docs = get().docs;
  const placeholder = docs.length === 1 && isPlaceholder(docs[0]) ? docs[0] : null;
  set({ docs: placeholder ? [doc] : [...docs, doc], activeId: doc.id });
  if (placeholder) removeDoc(placeholder.id);
  await setLanguage(doc.id, lang);
  return doc.id;
}

/** True for the single empty "new 1" tab the app starts with, which opening a file replaces. */
function isPlaceholder(doc: Doc): boolean {
  return !doc.path && !doc.dirty && snapshot(doc.id)?.text === "";
}

/** Adds a tab, taking the place of the empty first tab when that is all there is. */
function insertDoc(doc: Doc): void {
  const docs = get().docs;
  const placeholder = docs.length === 1 && isPlaceholder(docs[0]) ? docs[0] : null;
  set({ docs: placeholder ? [doc] : [...docs, doc], activeId: doc.id });
  if (placeholder) removeDoc(placeholder.id);
}

/** Opens a file in the read-only large-file viewer. */
export async function openBig(path: string): Promise<void> {
  const info = await platform.bigOpen(path);
  const doc = blankDoc({ name: info.name, path: info.path, readOnly: true, big: { id: info.id, lines: info.lines, size: info.size } });
  // The editor gets an empty read-only text for this tab, so editing commands have nothing to change.
  createDoc({ id: doc.id, text: "", readOnly: true });
  insertDoc(doc);
  remember(info.path);
}

export async function openPaths(paths: string[], options: { editor?: boolean } = {}): Promise<void> {
  for (const path of paths) {
    const existing = get().docs.find((doc) => doc.path?.toLowerCase() === path.toLowerCase());
    if (existing) {
      activate(existing.id);
      continue;
    }
    try {
      const [stat] = await platform.statFiles([path]);
      if (stat && stat.size > BIG_BYTES && !options.editor) {
        await openBig(path);
        continue;
      }
      const file = await platform.readFile(path);
      const doc = blankDoc({
        name: file.name,
        path: file.path,
        encoding: file.encoding,
        bom: file.bom,
        eol: file.eol,
        mtime: file.mtime,
        readOnly: file.read_only,
      });
      createDoc({ id: doc.id, text: file.text, readOnly: file.read_only });
      insertDoc(doc);
      remember(file.path);
      void setLanguage(doc.id, detectLanguage(file.name));
    } catch (error) {
      toast(describe(error));
    }
  }
}

/** Moves a file from the viewer into the editor, which loads all of it into memory. */
export async function openInEditor(id: string): Promise<void> {
  const doc = get().docs.find((d) => d.id === id);
  if (!doc?.path || !doc.big) return;
  const path = doc.path;
  dropDoc(id);
  closedPaths.pop();
  await openPaths([path], { editor: true });
}

async function loadPending(doc: Doc): Promise<void> {
  const saved = pendingDocs.get(doc.id);
  const path = doc.path as string;
  try {
    const [stat] = await platform.statFiles([path]);
    if (saved?.big || (stat && stat.size > BIG_BYTES)) {
      const info = await platform.bigOpen(path);
      createDoc({ id: doc.id, text: "", readOnly: true });
      patchDoc(doc.id, { pending: false, readOnly: true, big: { id: info.id, lines: info.lines, size: info.size } });
    } else {
      const file = await platform.readFile(path, !saved || saved.encoding === "UTF-8" ? undefined : saved.encoding);
      createDoc({ id: doc.id, text: file.text, readOnly: file.read_only, cursor: saved?.cursor, bookmarks: saved?.bookmarks });
      patchDoc(doc.id, { pending: false, mtime: file.mtime, readOnly: file.read_only, bom: file.bom });
      await setLanguage(doc.id, doc.lang);
    }
    pendingDocs.delete(doc.id);
  } catch (error) {
    toast(`${doc.name} could not be reopened: ${describe(error)}`);
    dropDoc(doc.id);
    closedPaths.pop();
  }
}

/** Reads a restored tab's file the first time the tab is needed. Resolves at once for loaded tabs. */
export function ensureLoaded(id: string): Promise<void> {
  const doc = get().docs.find((d) => d.id === id);
  if (!doc?.pending) return Promise.resolve();
  let job = loading.get(id);
  if (!job) {
    job = loadPending(doc).finally(() => loading.delete(id));
    loading.set(id, job);
  }
  return job;
}

/** Reads every tab that is still waiting. Search and replace across open files need all of them. */
export async function loadAll(): Promise<void> {
  for (const doc of get().docs) {
    if (doc.pending) await ensureLoaded(doc.id);
  }
}

export async function openDialog(): Promise<void> {
  const paths = await platform.pickFiles();
  if (paths.length) await openPaths(paths);
  else if (!platform.desktop) toast("Opening files needs the desktop app");
}

async function writeDoc(doc: Doc, path: string): Promise<number | null> {
  const text = textOf(doc.id, doc.eol);
  try {
    return await platform.writeFile(path, text, doc.encoding, doc.bom);
  } catch (error) {
    const message = describe(error);
    if (!message.includes("UNMAPPABLE")) throw error;
    const answer = await ask({
      title: `${doc.encoding} cannot store every character`,
      message: "Saving in this encoding would lose text. Save as UTF-8 instead?",
      buttons: [
        { label: "Save as UTF-8", value: "utf8", primary: true },
        { label: "Cancel", value: "cancel" },
      ],
    });
    if (answer.button !== "utf8") throw new Error("Not saved");
    patchDoc(doc.id, { encoding: "UTF-8", bom: false });
    return platform.writeFile(path, text, "UTF-8", false);
  }
}

/** True when the tab's text is in the editor and may be written to disk. */
function canSave(doc: Doc | undefined): doc is Doc {
  if (!doc) return false;
  if (doc.big) {
    toast("The large-file viewer is read-only, so there is nothing to save");
    return false;
  }
  return !doc.pending;
}

export async function saveAs(id: string): Promise<boolean> {
  const doc = get().docs.find((d) => d.id === id);
  if (!canSave(doc)) return false;
  const path = await platform.pickSavePath(doc.path ?? `${doc.name}.txt`);
  if (!path) return false;
  try {
    const mtime = await writeDoc(doc, path);
    const name = path.split(/[\\/]/).pop() ?? path;
    const renamed = name !== doc.name;
    patchDoc(id, { path, name, mtime, changedOnDisk: false, readOnly: false });
    markSaved(id);
    remember(path);
    if (renamed && doc.lang === PLAIN) void setLanguage(id, detectLanguage(name));
    return true;
  } catch (error) {
    toast(describe(error));
    return false;
  }
}

export async function save(id: string): Promise<boolean> {
  const doc = get().docs.find((d) => d.id === id);
  if (!canSave(doc)) return false;
  if (!doc.path) return saveAs(id);
  try {
    const mtime = await writeDoc(doc, doc.path);
    patchDoc(id, { mtime, changedOnDisk: false });
    markSaved(id);
    return true;
  } catch (error) {
    toast(describe(error));
    return false;
  }
}

export async function saveCopy(id: string): Promise<void> {
  const doc = get().docs.find((d) => d.id === id);
  if (!canSave(doc)) return;
  const path = await platform.pickSavePath(doc.path ?? `${doc.name}.txt`);
  if (!path) return;
  try {
    await writeDoc(doc, path);
    toast(`Copy saved to ${path}`);
  } catch (error) {
    toast(describe(error));
  }
}

export async function saveAll(): Promise<void> {
  for (const doc of get().docs) {
    if (doc.dirty && !doc.pending && !doc.big) await save(doc.id);
  }
}

/** Saves every changed file that already has a path. Untitled tabs are left to the session. */
export async function saveNamed(): Promise<void> {
  for (const doc of get().docs) {
    if (doc.dirty && doc.path && !doc.changedOnDisk && !doc.pending && !doc.big) await save(doc.id);
  }
}

function dropDoc(id: string): void {
  const { docs, activeId } = get();
  const index = docs.findIndex((doc) => doc.id === id);
  if (index < 0) return;
  const path = docs[index].path;
  if (path) closedPaths.push(path);
  const big = docs[index].big;
  if (big) void platform.bigClose(big.id);
  pendingDocs.delete(id);
  const rest = docs.filter((doc) => doc.id !== id);
  removeDoc(id);
  if (rest.length === 0) {
    set({ docs: [] });
    newDoc();
    return;
  }
  const nextActive = activeId === id ? rest[Math.min(index, rest.length - 1)].id : activeId;
  set({ docs: rest, activeId: nextActive });
}

/** Closes one tab, asking first when it has unsaved changes. Returns false when the user cancels. */
export async function closeDoc(id: string): Promise<boolean> {
  const doc = get().docs.find((d) => d.id === id);
  if (!doc) return true;
  if (doc.dirty) {
    activate(id);
    const answer = await ask({
      title: `Save changes to ${doc.name}?`,
      message: "Closing without saving discards them.",
      buttons: [
        { label: "Save", value: "save", primary: true },
        { label: "Don't save", value: "discard" },
        { label: "Cancel", value: "cancel" },
      ],
    });
    if (answer.button === "cancel" || answer.button === "") return false;
    if (answer.button === "save" && !(await save(id))) return false;
  }
  dropDoc(id);
  return true;
}

export async function closeMany(ids: string[]): Promise<void> {
  for (const id of ids) {
    if (!(await closeDoc(id))) return;
  }
}

export async function restoreClosed(): Promise<void> {
  const path = closedPaths.pop();
  if (path) await openPaths([path]);
  else toast("No closed file to restore");
}

async function replaceText(id: string, encoding?: string): Promise<void> {
  const doc = get().docs.find((d) => d.id === id);
  if (!doc?.path || doc.pending) return;
  if (doc.big) {
    toast("The large-file viewer already shows the file as it is on disk");
    return;
  }
  try {
    const file = await platform.readFile(doc.path, encoding);
    const state = snapshot(id);
    removeDoc(id);
    createDoc({ id, text: file.text, readOnly: doc.readOnly, cursor: state?.cursor, bookmarks: state?.bookmarks });
    patchDoc(id, { encoding: file.encoding, bom: file.bom, eol: file.eol, mtime: file.mtime, dirty: false, changedOnDisk: false });
    if (get().activeId === id) show(id);
    void setLanguage(id, doc.lang);
  } catch (error) {
    toast(describe(error));
  }
}

export async function reload(id: string): Promise<void> {
  const doc = get().docs.find((d) => d.id === id);
  if (!doc?.path) {
    toast("This tab has no file on disk yet");
    return;
  }
  if (doc.dirty) {
    const answer = await ask({
      title: `Reload ${doc.name} from disk?`,
      message: "Your unsaved changes in this tab will be lost.",
      buttons: [
        { label: "Reload", value: "reload", primary: true },
        { label: "Cancel", value: "cancel" },
      ],
    });
    if (answer.button !== "reload") return;
  }
  await replaceText(id);
}

export async function reopenWithEncoding(id: string, encoding: string): Promise<void> {
  const doc = get().docs.find((d) => d.id === id);
  if (!doc?.path) {
    toast("Save the file first, then reopen it in another encoding");
    return;
  }
  await replaceText(id, encoding);
}

export async function renameActive(): Promise<void> {
  const doc = activeDoc();
  if (!doc) return;
  const answer = await ask({
    title: "Rename",
    input: doc.name,
    buttons: [
      { label: "Rename", value: "ok", primary: true },
      { label: "Cancel", value: "cancel" },
    ],
  });
  const name = answer.input.trim();
  if (answer.button !== "ok" || !name || name === doc.name) return;
  if (!doc.path) {
    patchDoc(doc.id, { name });
    return;
  }
  try {
    const path = await platform.renameFile(doc.path, name);
    patchDoc(doc.id, { name, path });
    remember(path);
    void setLanguage(doc.id, detectLanguage(name));
  } catch (error) {
    toast(describe(error));
  }
}

export async function trashActive(): Promise<void> {
  const doc = activeDoc();
  if (!doc?.path) {
    toast("This tab has no file on disk yet");
    return;
  }
  const answer = await ask({
    title: `Move ${doc.name} to the Recycle Bin?`,
    message: "The tab closes and the file goes to the Recycle Bin.",
    buttons: [
      { label: "Move to Recycle Bin", value: "ok", primary: true },
      { label: "Cancel", value: "cancel" },
    ],
  });
  if (answer.button !== "ok") return;
  try {
    await platform.trashFile(doc.path);
    patchDoc(doc.id, { dirty: false });
    dropDoc(doc.id);
    closedPaths.pop();
  } catch (error) {
    toast(describe(error));
  }
}

/** Flags tabs whose file changed on disk since it was read or saved. */
export async function checkDisk(): Promise<void> {
  const docs = get().docs.filter((doc) => doc.path && !doc.pending && !doc.big);
  if (!docs.length) return;
  const stats = await platform.statFiles(docs.map((doc) => doc.path as string));
  docs.forEach((doc, index) => {
    const stat = stats[index];
    if (stat?.mtime && doc.mtime && Math.abs(stat.mtime - doc.mtime) > 1) {
      if (doc.dirty) patchDoc(doc.id, { changedOnDisk: true });
      else void replaceText(doc.id);
    }
  });
}

interface SavedDoc {
  name: string;
  path: string | null;
  encoding: string;
  bom: boolean;
  eol: Eol;
  lang: string;
  pinned: boolean;
  color: number;
  text?: string;
  cursor: number;
  bookmarks: number[];
  big?: boolean;
}

interface SavedSession {
  docs: SavedDoc[];
  active: number;
  recent: string[];
  workspace: string | null;
  side: string;
}

export async function saveSession(): Promise<void> {
  if (!sessionReady) return;
  const state = get();
  const docs: SavedDoc[] = [];
  for (const doc of state.docs) {
    if (doc.pending) {
      // Not read yet, so its saved entry is still exact.
      const waiting = pendingDocs.get(doc.id);
      // Name, pin and colour can change before the tab is first shown.
      if (waiting) docs.push({ ...waiting, name: doc.name, pinned: doc.pinned, color: doc.color });
      continue;
    }
    if (doc.big) {
      docs.push({ name: doc.name, path: doc.path, encoding: doc.encoding, bom: doc.bom, eol: doc.eol, lang: doc.lang, pinned: doc.pinned, color: doc.color, cursor: 0, bookmarks: [], big: true });
      continue;
    }
    const snap = snapshot(doc.id);
    if (!snap) continue;
    const keepText = !doc.path || doc.dirty;
    if (!doc.path && snap.text === "") continue;
    docs.push({
      name: doc.name,
      path: doc.path,
      encoding: doc.encoding,
      bom: doc.bom,
      eol: doc.eol,
      lang: doc.lang,
      pinned: doc.pinned,
      color: doc.color,
      text: keepText ? snap.text : undefined,
      cursor: snap.cursor,
      bookmarks: snap.bookmarks,
    });
  }
  const activeDocument = activeDoc();
  const session: SavedSession = {
    docs: state.settings.restoreSession ? docs : [],
    active: Math.max(0, docs.findIndex((doc) => doc.name === activeDocument?.name && doc.path === activeDocument?.path)),
    recent: state.recent,
    workspace: state.workspace,
    side: state.side,
  };
  await platform.storeSave("session", JSON.stringify(session));
  await platform.storeSave("settings", JSON.stringify(state.settings));
}

let sessionTimer: ReturnType<typeof setTimeout> | undefined;

export function scheduleSessionSave(): void {
  clearTimeout(sessionTimer);
  sessionTimer = setTimeout(() => void saveSession(), 1500);
}

export async function loadSession(): Promise<void> {
  try {
    const settingsJson = await platform.storeLoad("settings");
    if (settingsJson) set({ settings: { ...get().settings, ...JSON.parse(settingsJson) } });
  } catch {
    // A damaged settings file falls back to the defaults.
  }

  let session: SavedSession | null = null;
  for (const name of ["session", "session-backup"] as const) {
    try {
      const json = await platform.storeLoad(name);
      if (json) session = JSON.parse(json) as SavedSession;
    } catch {
      session = null;
    }
    if (session) break;
  }

  if (session) {
    set({
      recent: Array.isArray(session.recent) ? session.recent : [],
      workspace: session.workspace ?? null,
      side: session.side === "folder" || session.side === "docs" || session.side === "functions" ? session.side : "none",
    });
    const restored: Doc[] = [];
    for (const saved of session.docs ?? []) {
      const doc = blankDoc({
        name: saved.name,
        path: saved.path,
        encoding: saved.encoding,
        bom: saved.bom,
        eol: saved.eol,
        lang: saved.lang,
        pinned: saved.pinned,
        color: saved.color ?? 0,
      });
      if (saved.text !== undefined) {
        createDoc({ id: doc.id, text: saved.text, cursor: saved.cursor, bookmarks: saved.bookmarks, saved: false });
        doc.dirty = true;
        if (saved.path) {
          const [stat] = await platform.statFiles([saved.path]);
          doc.mtime = stat?.mtime ?? null;
        }
      } else if (saved.path) {
        // The file is read when the tab is first shown, so a session with hundreds of tabs still opens at once.
        doc.pending = true;
        pendingDocs.set(doc.id, saved);
      } else {
        continue;
      }
      restored.push(doc);
    }
    if (restored.length) {
      const active = restored[Math.min(session.active ?? 0, restored.length - 1)];
      set({ docs: restored, activeId: active.id });
      for (const doc of restored) {
        if (!doc.pending) void setLanguage(doc.id, doc.lang);
      }
    }
  }

  if (!get().docs.length) newDoc();
  sessionReady = true;
  markLoaded();
  const startup = await platform.startupFiles();
  if (startup.length) await openPaths(startup);
}
