// Everything that touches the operating system goes through here.
// Outside the desktop shell (plain browser, used for interface checks) the
// calls fall back to an in-memory stand-in so the interface still works.

import type { Eol } from "./store";

export interface FileData {
  path: string;
  name: string;
  text: string;
  encoding: string;
  bom: boolean;
  eol: Eol;
  mtime: number | null;
  read_only: boolean;
}

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

export interface FindOptions {
  dir: string;
  what: string;
  mode: "normal" | "extended" | "regex";
  matchCase: boolean;
  wholeWord: boolean;
  filters: string;
  subfolders: boolean;
  hidden: boolean;
  maxHits: number;
}

export interface FileHit {
  path: string;
  line: number;
  col: number;
  len: number;
  text: string;
}

export interface FindResult {
  hits: FileHit[];
  files_searched: number;
  files_with_hits: number;
  truncated: boolean;
}

export interface FileHash {
  path: string;
  hash: string | null;
  error: string | null;
}

export interface BigInfo {
  id: number;
  name: string;
  path: string;
  size: number;
  lines: number;
}

export interface BigHit {
  line: number;
  col: number;
  len: number;
}

declare const __APP_VERSION__: string;

export const desktop = "__TAURI_INTERNALS__" in window;

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

// The browser stand-in keeps "files" in local storage, so a reload can restore tabs the way the desktop app does.
const MEMORY_KEY = "anonymous-notepad-files";

function loadMemory(): Map<string, string> {
  try {
    return new Map(Object.entries(JSON.parse(localStorage.getItem(MEMORY_KEY) ?? "{}") as Record<string, string>));
  } catch {
    return new Map();
  }
}

const memory = desktop ? new Map<string, string>() : loadMemory();

function keepMemory(): void {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(Object.fromEntries(memory)));
  } catch {
    // Storage can be full or blocked; the stand-in then forgets on reload.
  }
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export async function readFile(path: string, encoding?: string): Promise<FileData> {
  if (desktop) return call<FileData>("read_file", { path, encoding: encoding ?? null });
  const text = memory.get(path);
  if (text === undefined) throw new Error(`Cannot open ${path}`);
  return { path, name: baseName(path), text, encoding: encoding ?? "UTF-8", bom: false, eol: "CRLF", mtime: 1, read_only: false };
}

export async function writeFile(path: string, text: string, encoding: string, bom: boolean): Promise<number | null> {
  if (desktop) return call<number | null>("write_file", { path, text, encoding, bom });
  memory.set(path, text);
  keepMemory();
  return Date.now();
}

export async function statFiles(paths: string[]): Promise<({ mtime: number | null; size: number } | null)[]> {
  if (desktop) return call("stat_files", { paths });
  return paths.map(() => null);
}

export async function listDir(path: string): Promise<DirEntry[]> {
  if (desktop) return call<DirEntry[]>("list_dir", { path });
  return [];
}

export async function renameFile(path: string, newName: string): Promise<string> {
  if (desktop) return call<string>("rename_file", { path, newName });
  const text = memory.get(path) ?? "";
  memory.delete(path);
  const next = path.replace(/[^\\/]+$/, newName);
  memory.set(next, text);
  return next;
}

export async function trashFile(path: string): Promise<void> {
  if (desktop) return call("trash_file", { path });
  memory.delete(path);
}

export async function findInFiles(options: FindOptions): Promise<FindResult> {
  if (desktop) return call<FindResult>("find_in_files", { options });
  return { hits: [], files_searched: 0, files_with_hits: 0, truncated: false };
}

async function webDigest(algorithm: string, text: string): Promise<string> {
  const names: Record<string, string> = { sha1: "SHA-1", sha256: "SHA-256", sha512: "SHA-512" };
  const name = names[algorithm];
  if (!name) return "MD5 needs the desktop app";
  const bytes = await crypto.subtle.digest(name, new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashText(algorithm: string, text: string): Promise<string> {
  if (desktop) return call<string>("hash_text", { algorithm, text });
  return webDigest(algorithm, text);
}

export async function hashFiles(algorithm: string, paths: string[]): Promise<FileHash[]> {
  if (desktop) return call<FileHash[]>("hash_files", { algorithm, paths });
  return [];
}

export async function storeLoad(name: "session" | "settings" | "session-backup"): Promise<string | null> {
  if (desktop) return call<string | null>("store_load", { name });
  try {
    return localStorage.getItem(`anonymous-notepad-${name}`);
  } catch {
    return null;
  }
}

export async function storeSave(name: "session" | "settings", json: string): Promise<void> {
  if (desktop) return call("store_save", { name, json });
  try {
    localStorage.setItem(`anonymous-notepad-${name}`, json);
  } catch {
    // Private windows can refuse storage; the session is simply not kept.
  }
}

export async function startupFiles(): Promise<string[]> {
  if (desktop) return call<string[]>("startup_files");
  return [];
}

export async function openTerminal(dir: string, shell: "cmd" | "powershell"): Promise<void> {
  if (desktop) return call("open_terminal", { dir, shell });
}

export async function pickFiles(): Promise<string[]> {
  if (!desktop) return [];
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ multiple: true, title: "Open" });
  if (!picked) return [];
  return Array.isArray(picked) ? picked : [picked];
}

export async function pickFolder(): Promise<string | null> {
  if (!desktop) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ directory: true, title: "Open folder" });
  return typeof picked === "string" ? picked : null;
}

export async function pickSavePath(suggested: string): Promise<string | null> {
  if (!desktop) return `memory/${baseName(suggested)}`;
  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({ defaultPath: suggested, title: "Save as" });
}

export async function reveal(path: string): Promise<void> {
  if (!desktop) return;
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(path);
}

export async function openUrl(url: string): Promise<void> {
  if (!desktop) {
    window.open(url, "_blank", "noopener");
    return;
  }
  const opener = await import("@tauri-apps/plugin-opener");
  await opener.openUrl(url);
}

export async function setAlwaysOnTop(on: boolean): Promise<void> {
  if (!desktop) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().setAlwaysOnTop(on);
}

export async function setFullscreen(on: boolean): Promise<void> {
  if (!desktop) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().setFullscreen(on);
}

export async function setTitle(title: string): Promise<void> {
  document.title = title;
  if (!desktop) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().setTitle(title);
}

export async function closeWindow(): Promise<void> {
  if (!desktop) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().destroy();
}

/** Calls `handler` before the window closes; the window stays open until `closeWindow`. */
export async function onCloseRequested(handler: () => void): Promise<void> {
  if (!desktop) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  await getCurrentWindow().onCloseRequested((event) => {
    event.preventDefault();
    handler();
  });
}

export async function onFilesOpened(handler: (paths: string[]) => void): Promise<void> {
  if (!desktop) return;
  const { listen } = await import("@tauri-apps/api/event");
  await listen<string[]>("open-files", (event) => handler(event.payload));
  const { getCurrentWebview } = await import("@tauri-apps/api/webview");
  await getCurrentWebview().onDragDropEvent((event) => {
    if (event.payload.type === "drop") handler(event.payload.paths);
  });
}

// The large-file viewer. In a plain browser a made-up 30-million-line log stands in for a real file.

const FAKE_LINES = 30_000_000;

export async function bigOpen(path: string): Promise<BigInfo> {
  if (desktop) return call<BigInfo>("big_open", { path });
  return { id: 1, name: baseName(path), path, size: 2_147_483_648, lines: FAKE_LINES };
}

export async function bigRead(id: number, from: number, count: number): Promise<string[]> {
  if (desktop) return call<string[]>("big_read", { id, from, count });
  const lines: string[] = [];
  for (let line = from; line < Math.min(FAKE_LINES, from + count); line += 1) {
    lines.push(`2026-11-26 12:${String(Math.floor(line / 60) % 60).padStart(2, "0")}:${String(line % 60).padStart(2, "0")} INFO request ${line} served in ${line % 977} ms from node-${line % 12}`);
  }
  return lines;
}

export async function bigFind(id: number, what: string, matchCase: boolean, line: number, col: number, backward: boolean): Promise<BigHit | null> {
  if (desktop) return call<BigHit | null>("big_find", { id, what, mode: "normal", matchCase, wholeWord: false, line, col, backward });
  const step = 1_000_000;
  const next = backward ? Math.ceil(line / step) * step - step : Math.floor(line / step) * step + step;
  return next >= 0 && next < FAKE_LINES ? { line: next, col: 20, len: 4 } : null;
}

export async function bigClose(id: number): Promise<void> {
  if (desktop) await call("big_close", { id });
}

// Updates. Outside the desktop app there is nothing to update.

export interface FoundUpdate {
  version: string;
  notes: string;
}

export async function appVersion(): Promise<string> {
  if (desktop) return call<string>("update_version");
  return __APP_VERSION__;
}

export async function updateCheck(): Promise<FoundUpdate | null> {
  if (!desktop) return null;
  return call<FoundUpdate | null>("update_check");
}

export async function updateInstall(): Promise<void> {
  if (desktop) await call("update_install");
}

export async function onUpdateProgress(handler: (done: number, total: number) => void): Promise<() => void> {
  if (!desktop) return () => undefined;
  const { listen } = await import("@tauri-apps/api/event");
  return listen<[number, number]>("update-progress", (event) => handler(event.payload[0], event.payload[1]));
}
