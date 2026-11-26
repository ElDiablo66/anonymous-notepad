// One editor view shows the active document. Every open document keeps its own
// editor state (text, undo history, selection, bookmarks) in `states`.

import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
  LanguageDescription,
} from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { highlightSelectionMatches } from "@codemirror/search";
import { Compartment, EditorState, Facet, type Extension, type Text, type TransactionSpec } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  highlightWhitespace,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import { indentationMarkers } from "@replit/codemirror-indentation-markers";
import { showMinimap } from "@replit/codemirror-minimap";
import { type Eol, get, patchDoc, set, type Settings } from "../store";
import { bookmarkPositions, bookmarks, look, marks, setBookmarks } from "./extras";

export const PLAIN = "Plain text";

const docIdFacet = Facet.define<string, string>({ combine: (values) => values[0] ?? "" });

const slots = {
  language: new Compartment(),
  wrap: new Compartment(),
  tabs: new Compartment(),
  whitespace: new Compartment(),
  guides: new Compartment(),
  numbers: new Compartment(),
  activeLine: new Compartment(),
  minimap: new Compartment(),
  complete: new Compartment(),
  close: new Compartment(),
  readOnly: new Compartment(),
};

const states = new Map<string, EditorState>();
const savedTexts = new Map<string, Text>();
const scrolls = new Map<string, number>();
let view: EditorView | null = null;
let shownId = "";

/** Called after every edit, so the session can be written out. */
export const hooks = { onEdit: (): void => {} };

function settingExtensions(settings: Settings): [Compartment, Extension][] {
  return [
    [slots.wrap, settings.wordWrap ? EditorView.lineWrapping : []],
    [
      slots.tabs,
      [EditorState.tabSize.of(settings.tabSize), indentUnit.of(settings.insertSpaces ? " ".repeat(settings.tabSize) : "\t")],
    ],
    [slots.whitespace, settings.showWhitespace ? highlightWhitespace() : []],
    [
      slots.guides,
      settings.indentGuides
        ? indentationMarkers({
            highlightActiveBlock: false,
            hideFirstIndent: true,
            thickness: 1,
            colors: { dark: "var(--ed-guide)", light: "var(--ed-guide)" },
          })
        : [],
    ],
    [slots.numbers, settings.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []],
    [slots.activeLine, settings.highlightLine ? highlightActiveLine() : []],
    [
      slots.minimap,
      settings.minimap
        ? showMinimap.compute([], () => ({
            create: () => ({ dom: document.createElement("div") }),
            displayText: "blocks",
            showOverlay: "always",
          }))
        : [],
    ],
    [slots.complete, settings.autoComplete ? autocompletion() : []],
    [slots.close, settings.autoClose ? closeBrackets() : []],
  ];
}

function reportCursor(state: EditorState): void {
  const main = state.selection.main;
  const line = state.doc.lineAt(main.head);
  let sel = 0;
  let selLines = 0;
  for (const range of state.selection.ranges) {
    sel += range.to - range.from;
    if (!range.empty) selLines += state.doc.lineAt(range.to).number - state.doc.lineAt(range.from).number + 1;
  }
  set({
    cursor: {
      line: line.number,
      col: main.head - line.from + 1,
      sel,
      selLines,
      ranges: state.selection.ranges.length,
      length: state.doc.length,
      lines: state.doc.lines,
    },
  });
}

function refreshDirty(id: string, doc: Text): void {
  const saved = savedTexts.get(id);
  const dirty = !saved || saved.length !== doc.length || !saved.eq(doc);
  patchDoc(id, { dirty });
}

let versionTimer: ReturnType<typeof setTimeout> | undefined;

const watcher = EditorView.updateListener.of((update) => {
  const id = update.state.facet(docIdFacet);
  if (update.docChanged) {
    refreshDirty(id, update.state.doc);
    hooks.onEdit();
    clearTimeout(versionTimer);
    versionTimer = setTimeout(() => set((s) => ({ textVersion: s.textVersion + 1 })), 250);
  }
  if (update.docChanged || update.selectionSet) reportCursor(update.state);
});

// Insert key mode: typing replaces the character under the cursor.
const overwrite = EditorView.inputHandler.of((target, from, to, text) => {
  if (!get().overwrite || from !== to || text.includes("\n")) return false;
  const line = target.state.doc.lineAt(from);
  const end = Math.min(line.to, from + text.length);
  if (end === from) return false;
  target.dispatch({
    changes: { from, to: end, insert: text },
    selection: { anchor: from + text.length },
    userEvent: "input.type",
  });
  return true;
});

function baseExtensions(id: string, readOnly: boolean): Extension[] {
  return [
    docIdFacet.of(id),
    bookmarks,
    ...settingExtensions(get().settings).map(([slot, extension]) => slot.of(extension)),
    foldGutter({ openText: "▾", closedText: "▸" }),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    rectangularSelection(),
    crosshairCursor(),
    highlightSelectionMatches({ minSelectionLength: 2 }),
    marks,
    look,
    overwrite,
    watcher,
    slots.language.of([]),
    slots.readOnly.of(EditorState.readOnly.of(readOnly)),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      ...foldKeymap,
      ...completionKeymap,
      indentWithTab,
    ]),
  ];
}

export interface NewDoc {
  id: string;
  text: string;
  readOnly?: boolean;
  cursor?: number;
  bookmarks?: number[];
  /** False when the text differs from what is on disk (a restored unsaved tab). */
  saved?: boolean;
}

export function createDoc(options: NewDoc): void {
  let state = EditorState.create({ doc: options.text, extensions: baseExtensions(options.id, options.readOnly ?? false) });
  const cursor = Math.min(options.cursor ?? 0, state.doc.length);
  const effects = options.bookmarks?.length ? setBookmarks.of(options.bookmarks) : undefined;
  state = state.update({ selection: { anchor: cursor }, effects }).state;
  states.set(options.id, state);
  if (options.saved !== false) savedTexts.set(options.id, state.doc);
}

export function removeDoc(id: string): void {
  states.delete(id);
  savedTexts.delete(id);
  scrolls.delete(id);
  if (shownId === id) shownId = "";
}

export function stateOf(id: string): EditorState | undefined {
  if (view && shownId === id) return view.state;
  return states.get(id);
}

const eolText: Record<Eol, string> = { CRLF: "\r\n", LF: "\n", CR: "\r" };

/** The document's text with the given line ending, ready to be written to disk. */
export function textOf(id: string, eol: Eol): string {
  const state = stateOf(id);
  return state ? state.doc.sliceString(0, undefined, eolText[eol]) : "";
}

export function markSaved(id: string): void {
  const state = stateOf(id);
  if (!state) return;
  savedTexts.set(id, state.doc);
  patchDoc(id, { dirty: false });
}

/** Marks a document as needing a save even though its text is unchanged (new encoding or line ending). */
export function markUnsaved(id: string): void {
  savedTexts.delete(id);
  patchDoc(id, { dirty: true });
}

/** Applies a change to a document whether or not it is the one on screen. */
export function dispatchTo(id: string, spec: TransactionSpec): void {
  if (view && shownId === id) {
    view.dispatch(spec);
    return;
  }
  const state = states.get(id);
  if (state) states.set(id, state.update(spec).state);
}

export function getView(): EditorView | null {
  return view;
}

export function mount(parent: HTMLElement): void {
  view = new EditorView({ parent, state: EditorState.create({ extensions: look }) });
  shownId = "";
}

export function unmount(): void {
  if (view && shownId) states.set(shownId, view.state);
  view?.destroy();
  view = null;
  shownId = "";
}

/** Puts a document on screen, keeping the previous one's state and scroll position. */
export function show(id: string): void {
  if (!view || shownId === id) return;
  if (shownId) {
    states.set(shownId, view.state);
    scrolls.set(shownId, view.scrollDOM.scrollTop);
  }
  const state = states.get(id);
  if (!state) return;
  view.setState(state);
  shownId = id;
  applySettings();
  const top = scrolls.get(id) ?? 0;
  const target = view;
  requestAnimationFrame(() => {
    target.requestMeasure();
    target.scrollDOM.scrollTop = top;
  });
  reportCursor(view.state);
  view.focus();
}

/** Pushes the current settings into the editor on screen. Other documents pick them up when shown. */
export function applySettings(): void {
  if (!view || !shownId) return;
  const doc = get().docs.find((d) => d.id === shownId);
  view.dispatch({
    effects: [
      ...settingExtensions(get().settings).map(([slot, extension]) => slot.reconfigure(extension)),
      slots.readOnly.reconfigure(EditorState.readOnly.of(doc?.readOnly ?? false)),
    ],
  });
}

/** Line heights are cached; call this after anything that changes the font's size or metrics. */
export function remeasure(): void {
  view?.requestMeasure();
}

export function focusEditor(): void {
  view?.focus();
}

export const languageNames: string[] = languages.map((language) => language.name).sort((a, b) => a.localeCompare(b));

export function detectLanguage(fileName: string): string {
  return LanguageDescription.matchFilename(languages, fileName)?.name ?? PLAIN;
}

/** Loads a language's grammar and attaches it to the document. */
export async function setLanguage(id: string, name: string): Promise<void> {
  patchDoc(id, { lang: name });
  const description = languages.find((language) => language.name === name);
  if (!description) {
    dispatchTo(id, { effects: slots.language.reconfigure([]) });
    return;
  }
  try {
    const support = await description.load();
    if (stateOf(id)) dispatchTo(id, { effects: slots.language.reconfigure(support) });
  } catch {
    dispatchTo(id, { effects: slots.language.reconfigure([]) });
  }
}

export function snapshot(id: string): { text: string; cursor: number; bookmarks: number[] } | null {
  const state = stateOf(id);
  if (!state) return null;
  return { text: state.doc.toString(), cursor: state.selection.main.head, bookmarks: bookmarkPositions(state) };
}
