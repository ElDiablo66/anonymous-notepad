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

export const desktop = "__TAURI_INTERNALS__" in window;

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

const memory = new Map<string, string>();

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

export async function storeLoad(name: "session" | "settings"): Promise<string | null> {
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
