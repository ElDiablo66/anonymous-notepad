// Edits that act on the document on screen: line tools, case, bookmarks, columns.

import { EditorSelection, type EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { getView } from "./editor/core";
import { bookmarkedLines, bookmarkPositions, setBookmarks, toggleBookmarkAt } from "./editor/extras";
import { toast } from "./store";
import type { CaseOp, LineOp } from "./textops";

/** The lines a line tool works on: the selected lines when several are selected, else the whole text. */
function targetLines(state: EditorState): { from: number; to: number } {
  const main = state.selection.main;
  const first = state.doc.lineAt(main.from);
  const last = state.doc.lineAt(main.to);
  if (main.empty || first.number === last.number) return { from: 0, to: state.doc.length };
  // A selection that ends at the start of a line does not include that line.
  const end = main.to === last.from ? state.doc.line(last.number - 1) : last;
  return { from: first.from, to: end.to };
}

export function runLineOp(op: LineOp): void {
  const view = getView();
  if (!view) return;
  const { from, to } = targetLines(view.state);
  const before = view.state.sliceDoc(from, to);
  const after = op(before.split("\n")).join("\n");
  if (after === before) return;
  view.dispatch({ changes: { from, to, insert: after }, userEvent: "input.lines" });
  view.focus();
}

export function runCaseOp(op: CaseOp): void {
  const view = getView();
  if (!view) return;
  if (view.state.selection.ranges.every((range) => range.empty)) {
    toast("Select some text first");
    return;
  }
  view.dispatch(
    view.state.changeByRange((range) => {
      const insert = op(view.state.sliceDoc(range.from, range.to));
      return { changes: { from: range.from, to: range.to, insert }, range: EditorSelection.range(range.from, range.from + insert.length) };
    }),
  );
  view.focus();
}

export function insertText(text: string): void {
  const view = getView();
  if (!view) return;
  view.dispatch(view.state.replaceSelection(text), { userEvent: "input", scrollIntoView: true });
  view.focus();
}

export function selectedText(): string {
  const view = getView();
  if (!view) return "";
  const main = view.state.selection.main;
  return view.state.sliceDoc(main.from, main.to);
}

export function gotoLine(lineNumber: number, column = 0, length = 0): void {
  const view = getView();
  if (!view) return;
  const line = view.state.doc.line(Math.max(1, Math.min(view.state.doc.lines, lineNumber)));
  const anchor = Math.min(line.to, line.from + column);
  view.dispatch({
    selection: EditorSelection.single(anchor, Math.min(line.to, anchor + length)),
    effects: EditorView.scrollIntoView(anchor, { y: "center" }),
  });
  view.focus();
}

export function gotoOffset(offset: number): void {
  const view = getView();
  if (!view) return;
  const anchor = Math.max(0, Math.min(view.state.doc.length, offset));
  view.dispatch({ selection: { anchor }, effects: EditorView.scrollIntoView(anchor, { y: "center" }) });
  view.focus();
}

export function insertLineAbove(): void {
  const view = getView();
  if (!view) return;
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  view.dispatch({ changes: { from: line.from, insert: "\n" }, selection: { anchor: line.from } });
}

export function toggleBookmark(): void {
  const view = getView();
  if (view) toggleBookmarkAt(view, view.state.selection.main.head);
}

export function jumpBookmark(direction: 1 | -1): void {
  const view = getView();
  if (!view) return;
  const lines = bookmarkedLines(view.state);
  if (!lines.length) {
    toast("No bookmarks in this file");
    return;
  }
  const current = view.state.doc.lineAt(view.state.selection.main.head).number;
  const target =
    direction === 1
      ? (lines.find((line) => line > current) ?? lines[0])
      : ([...lines].reverse().find((line) => line < current) ?? lines[lines.length - 1]);
  gotoLine(target);
}

export function clearBookmarks(): void {
  getView()?.dispatch({ effects: setBookmarks.of([]) });
}

export function invertBookmarks(): void {
  const view = getView();
  if (!view) return;
  const marked = new Set(bookmarkedLines(view.state));
  const next: number[] = [];
  for (let number = 1; number <= view.state.doc.lines; number += 1) {
    if (!marked.has(number)) next.push(view.state.doc.line(number).from);
  }
  view.dispatch({ effects: setBookmarks.of(next) });
}

function bookmarkedText(state: EditorState): string {
  return bookmarkedLines(state)
    .map((number) => state.doc.line(number).text)
    .join("\n");
}

function removeLines(view: EditorView, keep: (lineNumber: number) => boolean): void {
  const kept: string[] = [];
  for (let number = 1; number <= view.state.doc.lines; number += 1) {
    if (keep(number)) kept.push(view.state.doc.line(number).text);
  }
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: kept.join("\n") },
    effects: setBookmarks.of([]),
    userEvent: "delete.lines",
  });
}

export async function copyBookmarked(cut: boolean): Promise<void> {
  const view = getView();
  if (!view) return;
  const marked = new Set(bookmarkedLines(view.state));
  if (!marked.size) {
    toast("No bookmarks in this file");
    return;
  }
  await navigator.clipboard.writeText(bookmarkedText(view.state));
  if (cut) removeLines(view, (number) => !marked.has(number));
  toast(`${marked.size} bookmarked ${marked.size === 1 ? "line" : "lines"} ${cut ? "cut" : "copied"}`);
}

export function removeBookmarked(keepBookmarked: boolean): void {
  const view = getView();
  if (!view) return;
  const marked = new Set(bookmarkedLines(view.state));
  if (!marked.size) {
    toast("No bookmarks in this file");
    return;
  }
  removeLines(view, (number) => marked.has(number) === keepBookmarked);
}

/**
 * Inserts one value per line. With several cursors each gets a value; with a
 * selection across lines the values go down the cursor's column.
 */
export function columnInsert(values: (count: number) => string[]): number {
  const view = getView();
  if (!view) return 0;
  const state = view.state;
  const ranges = state.selection.ranges;
  if (ranges.length > 1) {
    const items = values(ranges.length);
    const ordered = [...ranges].sort((a, b) => a.from - b.from);
    view.dispatch({
      changes: ordered.map((range, index) => ({ from: range.from, to: range.to, insert: items[index] })),
      userEvent: "input.column",
    });
    return ranges.length;
  }
  const main = state.selection.main;
  const first = state.doc.lineAt(main.from);
  const last = state.doc.lineAt(main.to);
  const column = main.head - state.doc.lineAt(main.head).from;
  const count = last.number - first.number + 1;
  const items = values(count);
  const changes = [];
  for (let index = 0; index < count; index += 1) {
    const line = state.doc.line(first.number + index);
    const padding = " ".repeat(Math.max(0, column - line.length));
    changes.push({ from: Math.min(line.to, line.from + column), insert: padding + items[index] });
  }
  view.dispatch({ changes, userEvent: "input.column" });
  return count;
}

export function hasBookmarks(): boolean {
  const view = getView();
  return view ? bookmarkPositions(view.state).length > 0 : false;
}
