// Find, replace, count and mark inside open documents.

import { SearchQuery } from "@codemirror/search";
import { EditorSelection, type EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { dispatchTo, getView, stateOf } from "./editor/core";
import { refreshScrollMarks, scrollSearch } from "./editor/scrollmarks";
import { addMarks, bookmarkPositions, clearMarks, setBookmarks, type Span } from "./editor/extras";
import { get, type Hit } from "./store";
import { unescapeExtended } from "./textops";

export type SearchMode = "normal" | "extended" | "regex";

export interface FindOptions {
  what: string;
  replace: string;
  mode: SearchMode;
  matchCase: boolean;
  wholeWord: boolean;
  wrap: boolean;
  inSelection: boolean;
}

/** The last search, shared by the find panel and the find next and previous keys. */
export const lastFind: FindOptions = {
  what: "",
  replace: "",
  mode: "normal",
  matchCase: false,
  wholeWord: false,
  wrap: true,
  inSelection: false,
};

const HIT_LIMIT = 20000;

/** The editor stores every line break as "\n", so searches for "\r\n" or "\r" mean that too. */
function normalizeBreaks(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

export function buildQuery(options: FindOptions): SearchQuery | null {
  if (!options.what) return null;
  const search = options.mode === "extended" ? normalizeBreaks(unescapeExtended(options.what)) : options.what;
  const query = new SearchQuery({
    search,
    caseSensitive: options.matchCase,
    regexp: options.mode === "regex",
    literal: options.mode !== "regex",
    wholeWord: options.wholeWord,
  });
  return query.valid ? query : null;
}

function spans(query: SearchQuery, state: EditorState, from = 0, to = state.doc.length): Span[] {
  const out: Span[] = [];
  const cursor = query.getCursor(state, from, to);
  for (let step = cursor.next(); !step.done; step = cursor.next()) {
    if (step.value.to > step.value.from) out.push({ from: step.value.from, to: step.value.to });
    if (out.length >= HIT_LIMIT) break;
  }
  return out;
}

function scope(state: EditorState, options: FindOptions): { from: number; to: number } {
  const main = state.selection.main;
  return options.inSelection && !main.empty ? { from: main.from, to: main.to } : { from: 0, to: state.doc.length };
}

function reveal(view: EditorView, span: Span): void {
  view.dispatch({
    selection: EditorSelection.single(span.from, span.to),
    effects: EditorView.scrollIntoView(span.from, { y: "center" }),
    userEvent: "select.search",
  });
}

export type FindOutcome = "found" | "wrapped" | "none" | "invalid";

export function findNext(options: FindOptions, backward = false): FindOutcome {
  const view = getView();
  const query = buildQuery(options);
  if (!view || !query) return options.what ? "invalid" : "none";
  const state = view.state;
  const all = spans(query, state);
  if (!all.length) return "none";
  const main = state.selection.main;
  if (backward) {
    const before = all.filter((span) => span.to <= main.from && !(span.from === main.from && span.to === main.to));
    if (before.length) {
      reveal(view, before[before.length - 1]);
      return "found";
    }
    if (!options.wrap) return "none";
    reveal(view, all[all.length - 1]);
    return "wrapped";
  }
  const after = all.find((span) => span.from >= main.to && !(span.from === main.from && span.to === main.to));
  if (after) {
    reveal(view, after);
    return "found";
  }
  if (!options.wrap) return "none";
  reveal(view, all[0]);
  return "wrapped";
}

export function count(options: FindOptions): number | null {
  const view = getView();
  const query = buildQuery(options);
  if (!view || !query) return null;
  const range = scope(view.state, options);
  return spans(query, view.state, range.from, range.to).length;
}

function replacementFor(options: FindOptions, matched: string): string {
  if (options.mode === "normal") return options.replace;
  if (options.mode === "extended") return normalizeBreaks(unescapeExtended(options.replace));
  // Regular expression mode: \1 and $1 both refer to groups, and \n, \t work in the replacement.
  const template = normalizeBreaks(unescapeExtended(options.replace)).replace(/\\(\d)/g, "$$$1");
  try {
    const pattern = new RegExp(options.what, options.matchCase ? "u" : "iu");
    return matched.replace(pattern, template);
  } catch {
    return template;
  }
}

function isReadOnly(): boolean {
  const doc = get().docs.find((d) => d.id === get().activeId);
  return doc?.readOnly ?? false;
}

/** Replaces the selected match, then moves to the next one. */
export function replaceOne(options: FindOptions): FindOutcome {
  const view = getView();
  const query = buildQuery(options);
  if (!view || !query) return options.what ? "invalid" : "none";
  if (isReadOnly()) return "none";
  const main = view.state.selection.main;
  const isMatch = !main.empty && spans(query, view.state, main.from, main.to).some((s) => s.from === main.from && s.to === main.to);
  if (isMatch) {
    const insert = replacementFor(options, view.state.sliceDoc(main.from, main.to));
    view.dispatch({
      changes: { from: main.from, to: main.to, insert },
      selection: { anchor: main.from + insert.length },
      userEvent: "input.replace",
    });
  }
  return findNext(options);
}

function replaceInState(id: string, state: EditorState, options: FindOptions, range: { from: number; to: number }): number {
  const query = buildQuery(options);
  if (!query) return 0;
  const found = spans(query, state, range.from, range.to);
  if (!found.length) return 0;
  const changes = found.map((span) => ({
    from: span.from,
    to: span.to,
    insert: replacementFor(options, state.sliceDoc(span.from, span.to)),
  }));
  dispatchTo(id, { changes, userEvent: "input.replace.all" });
  return found.length;
}

export function replaceAll(options: FindOptions): number {
  const view = getView();
  if (!view || isReadOnly()) return 0;
  return replaceInState(get().activeId, view.state, options, scope(view.state, options));
}

export function replaceAllOpen(options: FindOptions): number {
  let total = 0;
  for (const doc of get().docs) {
    const state = stateOf(doc.id);
    if (!state || doc.readOnly) continue;
    total += replaceInState(doc.id, state, options, { from: 0, to: state.doc.length });
  }
  return total;
}

function hitsIn(docId: string, label: string, state: EditorState, query: SearchQuery): Hit[] {
  return spans(query, state).map((span) => {
    const line = state.doc.lineAt(span.from);
    return {
      docId,
      label,
      line: line.number,
      col: span.from - line.from,
      len: Math.min(span.to, line.to) - span.from,
      text: line.text.length > 400 ? `${line.text.slice(0, 400)}…` : line.text,
    };
  });
}

export function findAll(options: FindOptions, everyOpenDoc: boolean): Hit[] | null {
  const query = buildQuery(options);
  if (!query) return null;
  const docs = everyOpenDoc ? get().docs : get().docs.filter((doc) => doc.id === get().activeId);
  const hits: Hit[] = [];
  for (const doc of docs) {
    const state = stateOf(doc.id);
    if (state) hits.push(...hitsIn(doc.id, doc.name, state, query));
    if (hits.length >= HIT_LIMIT) break;
  }
  return hits;
}

/** Colours every match with a mark style and can bookmark the lines too. */
export function markAll(options: FindOptions, style: number, bookmarkLines: boolean, purge: boolean): number | null {
  const view = getView();
  const query = buildQuery(options);
  if (!view || !query) return null;
  const range = scope(view.state, options);
  const found = spans(query, view.state, range.from, range.to);
  const effects = [];
  if (purge) effects.push(clearMarks.of(style));
  effects.push(addMarks.of({ style, spans: found }));
  if (bookmarkLines) {
    effects.push(setBookmarks.of([...bookmarkPositions(view.state), ...found.map((span) => span.from)]));
  }
  view.dispatch({ effects });
  return found.length;
}

/** Colours every occurrence of the selected text (or the word at the cursor). */
export function styleSelection(style: number): number {
  const view = getView();
  if (!view) return 0;
  const main = view.state.selection.main;
  const word = main.empty ? view.state.wordAt(main.head) : main;
  if (!word || word.from === word.to) return 0;
  const what = view.state.sliceDoc(word.from, word.to);
  const query = new SearchQuery({ search: what, caseSensitive: true, literal: true, wholeWord: main.empty });
  const found = spans(query, view.state);
  view.dispatch({ effects: addMarks.of({ style, spans: found }) });
  return found.length;
}

export function clearStyle(style: number): void {
  getView()?.dispatch({ effects: clearMarks.of(style) });
}

/** Text to prefill the find box with: the selection when it sits on one line. */
export function selectionSeed(): string {
  const view = getView();
  if (!view) return "";
  const main = view.state.selection.main;
  const text = view.state.sliceDoc(main.from, main.to);
  return text.includes("\n") || text.length > 200 ? "" : text;
}

const SCROLL_MARK_LIMIT = 10000;

let markCache: { doc: unknown; key: string; matches: number[] } | null = null;

scrollSearch.matches = (state) => {
  const panel = get().bottom;
  if (panel !== "find" && panel !== "results") return null;
  const query = buildQuery(lastFind);
  if (!query) return null;
  // The same text and the same search give the same matches; moving the cursor costs nothing.
  const key = JSON.stringify([lastFind.what, lastFind.mode, lastFind.matchCase, lastFind.wholeWord]);
  if (markCache && markCache.doc === state.doc && markCache.key === key) return markCache.matches;
  const out: number[] = [];
  const cursor = query.getCursor(state);
  for (let step = cursor.next(); !step.done && out.length < SCROLL_MARK_LIMIT; step = cursor.next()) {
    if (step.value.to > step.value.from) out.push(step.value.from);
  }
  markCache = { doc: state.doc, key, matches: out };
  return out;
};

/** Redraws the scrollbar marks after the search text or options changed. */
export function searchChanged(): void {
  refreshScrollMarks(getView());
}
