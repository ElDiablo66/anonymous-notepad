// Bookmarks in the gutter, coloured marks in the text, and the editor's colours.

import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState, RangeSet, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, gutter, GutterMarker } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

class BookmarkMarker extends GutterMarker {
  toDOM(): Node {
    const dot = document.createElement("span");
    dot.className = "cm-bookmark-dot";
    return dot;
  }
}

const bookmark = new BookmarkMarker();

/** Replaces every bookmark with the given line start positions. */
export const setBookmarks = StateEffect.define<number[]>();

function build(state: EditorState, positions: number[]): RangeSet<GutterMarker> {
  const starts = new Set<number>();
  for (const pos of positions) {
    if (pos >= 0 && pos <= state.doc.length) starts.add(state.doc.lineAt(pos).from);
  }
  return RangeSet.of([...starts].sort((a, b) => a - b).map((from) => bookmark.range(from)));
}

function positions(set: RangeSet<GutterMarker>): number[] {
  const out: number[] = [];
  const cursor = set.iter();
  while (cursor.value) {
    out.push(cursor.from);
    cursor.next();
  }
  return out;
}

const bookmarkField = StateField.define<RangeSet<GutterMarker>>({
  create: () => RangeSet.empty,
  update(set, tr) {
    let next = set;
    if (tr.docChanged && set.size) {
      // Mapping can leave a mark mid-line or stack two on one line; rebuilding snaps them to line starts.
      next = build(tr.state, positions(set.map(tr.changes)));
    }
    for (const effect of tr.effects) {
      if (effect.is(setBookmarks)) next = build(tr.state, effect.value);
    }
    return next;
  },
});

/** Line numbers (1-based) that carry a bookmark, in order. */
export function bookmarkedLines(state: EditorState): number[] {
  return positions(state.field(bookmarkField)).map((pos) => state.doc.lineAt(pos).number);
}

export function bookmarkPositions(state: EditorState): number[] {
  return positions(state.field(bookmarkField));
}

export function toggleBookmarkAt(view: EditorView, pos: number): void {
  const from = view.state.doc.lineAt(pos).from;
  const current = bookmarkPositions(view.state);
  const next = current.includes(from) ? current.filter((p) => p !== from) : [...current, from];
  view.dispatch({ effects: setBookmarks.of(next) });
}

export const bookmarks: Extension = [
  bookmarkField,
  gutter({
    class: "cm-bookmarks",
    markers: (view) => view.state.field(bookmarkField),
    initialSpacer: () => bookmark,
    domEventHandlers: {
      mousedown(view, line) {
        toggleBookmarkAt(view, line.from);
        return true;
      },
    },
  }),
];

export interface Span {
  from: number;
  to: number;
}

/** Style 0 is the search highlight, 1 to 5 are the user's colours. */
export const addMarks = StateEffect.define<{ style: number; spans: Span[] }>({
  map: (value, mapping) => ({
    style: value.style,
    spans: value.spans.map((span) => ({ from: mapping.mapPos(span.from), to: mapping.mapPos(span.to) })),
  }),
});

/** Clears one style, or every style with -1. */
export const clearMarks = StateEffect.define<number>();

const markStyles = [0, 1, 2, 3, 4, 5].map((style) =>
  Decoration.mark({ class: `cm-mark cm-mark-${style}`, markStyle: style }),
);

const markField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(set, tr) {
    let next = set.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(addMarks)) {
        const add = effect.value.spans
          .filter((span) => span.to > span.from)
          .map((span) => markStyles[effect.value.style].range(span.from, span.to));
        next = next.update({ add, sort: true });
      } else if (effect.is(clearMarks)) {
        const style = effect.value;
        next = style === -1 ? Decoration.none : next.update({ filter: (_from, _to, deco) => deco.spec.markStyle !== style });
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export const marks: Extension = markField;

/** Marked spans of one style, in document order. */
export function markedSpans(state: EditorState, style: number): Span[] {
  const out: Span[] = [];
  state.field(markField).between(0, state.doc.length, (from, to, deco) => {
    if (deco.spec.markStyle === style) out.push({ from, to });
  });
  return out;
}

// Colours come from CSS variables so the three themes share one definition.
const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.operatorKeyword, t.modifier, t.controlKeyword, t.definitionKeyword, t.moduleKeyword], color: "var(--syn-keyword)" },
  { tag: [t.string, t.special(t.string), t.character, t.attributeValue], color: "var(--syn-string)" },
  { tag: [t.regexp, t.escape], color: "var(--syn-escape)" },
  { tag: [t.number, t.bool, t.null, t.atom, t.unit], color: "var(--syn-number)" },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment, t.meta], color: "var(--syn-comment)", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], color: "var(--syn-function)" },
  { tag: [t.typeName, t.className, t.namespace, t.standard(t.typeName)], color: "var(--syn-type)" },
  { tag: [t.tagName, t.angleBracket], color: "var(--syn-tag)" },
  { tag: [t.attributeName, t.propertyName], color: "var(--syn-property)" },
  { tag: [t.operator, t.punctuation, t.separator, t.bracket], color: "var(--syn-punctuation)" },
  { tag: [t.definition(t.variableName), t.constant(t.variableName), t.labelName], color: "var(--syn-constant)" },
  { tag: t.heading, color: "var(--syn-keyword)", fontWeight: "600" },
  { tag: t.link, color: "var(--syn-function)", textDecoration: "underline" },
  { tag: t.url, color: "var(--syn-function)" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "600" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: [t.inserted], color: "var(--syn-string)" },
  { tag: [t.deleted, t.invalid], color: "var(--syn-invalid)" },
]);

const chrome = EditorView.theme(
  {
    "&": { height: "100%", color: "var(--ed-text)", backgroundColor: "transparent", fontSize: "var(--ed-size)" },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": { fontFamily: "var(--mono)", fontVariantLigatures: "none", lineHeight: "1.55", overflow: "auto" },
    ".cm-content": { caretColor: "var(--ed-cursor)", padding: "6px 0 40vh" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--ed-cursor)", borderLeftWidth: "2px" },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "var(--ed-selection)",
    },
    ".cm-gutters": { backgroundColor: "var(--ed-gutter)", color: "var(--ed-gutter-text)", border: "none" },
    ".cm-lineNumbers .cm-gutterElement": { padding: "0 10px 0 6px", minWidth: "3ch", fontVariantNumeric: "tabular-nums" },
    ".cm-activeLine": { backgroundColor: "var(--ed-line)" },
    ".cm-activeLineGutter": { backgroundColor: "var(--ed-line)", color: "var(--ed-text)" },
    ".cm-foldGutter .cm-gutterElement": { padding: "0 4px", cursor: "pointer", color: "var(--ed-gutter-text)" },
    ".cm-foldPlaceholder": {
      backgroundColor: "var(--panel-high)",
      border: "none",
      color: "var(--text-soft)",
      padding: "0 6px",
      borderRadius: "3px",
    },
    ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
      backgroundColor: "var(--ed-bracket)",
      outline: "1px solid var(--accent)",
    },
    ".cm-nonmatchingBracket": { backgroundColor: "transparent", color: "var(--syn-invalid)" },
    ".cm-selectionMatch": { backgroundColor: "var(--ed-match)" },
    ".cm-bookmarks": { width: "14px", cursor: "pointer" },
    ".cm-bookmark-dot": {
      display: "block",
      width: "8px",
      height: "8px",
      margin: "0.5em 0 0 4px",
      borderRadius: "50%",
      background: "var(--go)",
    },
    ".cm-bookmarks .cm-gutterElement:first-child .cm-bookmark-dot": { visibility: "hidden" },
    ".cm-mark": { borderRadius: "2px" },
    ".cm-mark-0": { backgroundColor: "var(--mark-0)" },
    ".cm-mark-1": { backgroundColor: "var(--mark-1)" },
    ".cm-mark-2": { backgroundColor: "var(--mark-2)" },
    ".cm-mark-3": { backgroundColor: "var(--mark-3)" },
    ".cm-mark-4": { backgroundColor: "var(--mark-4)" },
    ".cm-mark-5": { backgroundColor: "var(--mark-5)" },
    ".cm-highlightSpace": { backgroundImage: "radial-gradient(circle at 50% 55%, var(--ed-gutter-text) 14%, transparent 16%)" },
    ".cm-highlightTab": { opacity: "0.55" },
    ".cm-tooltip": {
      backgroundColor: "var(--solid)",
      border: "1px solid var(--line)",
      borderRadius: "6px",
      color: "var(--text)",
      boxShadow: "0 10px 30px var(--shadow)",
    },
    ".cm-tooltip-autocomplete > ul > li": { padding: "3px 8px" },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": { background: "var(--panel-high)", color: "var(--text)" },
    ".cm-panels": { backgroundColor: "var(--panel)", color: "var(--text)" },
  },
  { dark: true },
);

export const look: Extension = [chrome, syntaxHighlighting(highlight)];
