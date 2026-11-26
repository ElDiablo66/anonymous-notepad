import { useSyncExternalStore } from "react";
import type { ThemeId } from "./themes";

export type Eol = "CRLF" | "LF" | "CR";

export interface Doc {
  id: string;
  name: string;
  path: string | null;
  encoding: string;
  bom: boolean;
  eol: Eol;
  /** Language name from the language list, or "Plain text". */
  lang: string;
  dirty: boolean;
  pinned: boolean;
  readOnly: boolean;
  mtime: number | null;
  /** 0 is no colour, 1 to 5 pick a tab colour. */
  color: number;
  changedOnDisk: boolean;
  /** A tab restored from the last session whose file has not been read yet. */
  pending: boolean;
  /** Set when the file is shown by the read-only large-file viewer instead of the editor. */
  big: { id: number; lines: number; size: number } | null;
}

export interface Settings {
  theme: ThemeId;
  /** How much neon: none, on the interface only, or on the code as well. */
  glow: "off" | "soft" | "full";
  toolbar: boolean;
  startScreen: boolean;
  /** Interface size as a multiplier, or null to fit the window. */
  uiSize: number | null;
  fontSize: number;
  tabSize: number;
  insertSpaces: boolean;
  wordWrap: boolean;
  showWhitespace: boolean;
  indentGuides: boolean;
  lineNumbers: boolean;
  highlightLine: boolean;
  minimap: boolean;
  autoComplete: boolean;
  autoClose: boolean;
  backgroundArt: boolean;
  restoreSession: boolean;
  /** What to do when a newer version is on GitHub. */
  updates: "auto" | "tell" | "off";
  /** Writes changed files that already have a place on disk when the window loses focus. */
  saveOnBlur: boolean;
  searchEngine: string;
}

export const defaultSettings: Settings = {
  theme: "vice-night",
  glow: "soft",
  toolbar: true,
  startScreen: true,
  uiSize: null,
  fontSize: 14,
  tabSize: 4,
  insertSpaces: false,
  wordWrap: false,
  showWhitespace: false,
  indentGuides: true,
  lineNumbers: true,
  highlightLine: true,
  minimap: false,
  autoComplete: true,
  autoClose: true,
  backgroundArt: true,
  restoreSession: true,
  saveOnBlur: false,
  updates: "auto",
  searchEngine: "https://duckduckgo.com/?q=",
};

export interface Hit {
  docId?: string;
  path?: string;
  label: string;
  line: number;
  col: number;
  len: number;
  text: string;
}

export interface Results {
  title: string;
  hits: Hit[];
  note?: string;
}

export interface CursorInfo {
  line: number;
  col: number;
  sel: number;
  selLines: number;
  ranges: number;
  length: number;
  lines: number;
}

export type SidePanel = "none" | "folder" | "docs" | "functions";
export type BottomPanel = "none" | "find" | "results";
export type FindTab = "find" | "replace" | "files" | "mark";
export type SheetName = "preferences" | "hash" | "summary" | "column" | "about" | "shortcuts";

export interface PickItem {
  label: string;
  hint?: string;
  run: () => void;
}

export interface Picker {
  placeholder: string;
  items: PickItem[];
}

export interface Ask {
  title: string;
  message?: string;
  /** When set, the dialog shows a text field with this starting value. */
  input?: string;
  buttons: { label: string; value: string; primary?: boolean }[];
  resolve: (answer: { button: string; input: string }) => void;
}

export interface AppState {
  docs: Doc[];
  activeId: string;
  settings: Settings;
  recent: string[];
  side: SidePanel;
  bottom: BottomPanel;
  findTab: FindTab;
  sheet: SheetName | null;
  picker: Picker | null;
  ask: Ask | null;
  workspace: string | null;
  results: Results | null;
  cursor: CursorInfo;
  overwrite: boolean;
  fullscreen: boolean;
  zen: boolean;
  onTop: boolean;
  toast: string | null;
  /** Bumps whenever the active text changes, so panels that read it can refresh. */
  textVersion: number;
  /** Bumps when the find panel should take the selection and focus its box. */
  findNonce: number;
  /** A newer version found on GitHub and not installed yet. */
  update: { version: string; notes: string; busy: boolean } | null;
}

let state: AppState = {
  docs: [],
  activeId: "",
  settings: defaultSettings,
  recent: [],
  side: "none",
  bottom: "none",
  findTab: "find",
  sheet: null,
  picker: null,
  ask: null,
  workspace: null,
  results: null,
  cursor: { line: 1, col: 1, sel: 0, selLines: 0, ranges: 1, length: 0, lines: 1 },
  overwrite: false,
  fullscreen: false,
  zen: false,
  onTop: false,
  toast: null,
  textVersion: 0,
  findNonce: 0,
  update: null,
};

const listeners = new Set<() => void>();

export function get(): AppState {
  return state;
}

export function set(patch: Partial<AppState> | ((current: AppState) => Partial<AppState>)): void {
  const next = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Subscribes a component to one slice. The selector must return a stable value. */
export function useStore<T>(selector: (current: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state));
}

export function onChange(listener: () => void): () => void {
  return subscribe(listener);
}

export function activeDoc(): Doc | undefined {
  return state.docs.find((doc) => doc.id === state.activeId);
}

export function patchDoc(id: string, patch: Partial<Doc>): void {
  const current = state.docs.find((doc) => doc.id === id);
  if (!current) return;
  const changed = (Object.keys(patch) as (keyof Doc)[]).some((key) => current[key] !== patch[key]);
  if (!changed) return;
  set({ docs: state.docs.map((doc) => (doc.id === id ? { ...doc, ...patch } : doc)) });
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  set({ settings: { ...state.settings, [key]: value } });
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function toast(message: string): void {
  set({ toast: message });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => set({ toast: null }), 3200);
}

export function ask(options: Omit<Ask, "resolve">): Promise<{ button: string; input: string }> {
  return new Promise((resolve) => {
    set({
      ask: {
        ...options,
        resolve: (answer) => {
          set({ ask: null });
          resolve(answer);
        },
      },
    });
  });
}

let counter = 0;

export function newId(): string {
  counter += 1;
  return `d${Date.now().toString(36)}${counter}`;
}
