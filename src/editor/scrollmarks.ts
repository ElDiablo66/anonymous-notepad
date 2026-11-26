// Marks on the scrollbar track: where the current search matches, the bookmarks and the
// coloured occurrences are in the whole file. Drawn on one canvas over the scrollbar, which
// lets clicks through, so the scrollbar itself works as before.

import { StateEffect, type EditorState } from "@codemirror/state";
import { type EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";
import { bookmarkPositions, markedSpans } from "./extras";

/** Hands the plugin the current search, or null when no search should be shown. */
export const scrollSearch = { matches: (_state: EditorState): number[] | null => null };

const refresh = StateEffect.define<null>();

/** Asks every editor to redraw its marks, after the search or the panel changed. */
export function refreshScrollMarks(view: EditorView | null): void {
  view?.dispatch({ effects: refresh.of(null) });
}

const WIDTH = 11;

class ScrollMarks {
  canvas: HTMLCanvasElement;
  frame = 0;

  constructor(readonly view: EditorView) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "cm-scrollmarks";
    this.canvas.setAttribute("aria-hidden", "true");
    view.dom.appendChild(this.canvas);
    this.schedule();
  }

  update(update: ViewUpdate): void {
    if (update.docChanged || update.selectionSet || update.viewportChanged || update.geometryChanged || update.heightChanged || update.transactions.some((tr) => tr.effects.length > 0)) {
      this.schedule();
    }
  }

  schedule(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.draw());
  }

  draw(): void {
    const { view, canvas } = this;
    const scroller = view.scrollDOM;
    const height = scroller.clientHeight;
    const total = scroller.scrollHeight;
    // Not laid out yet (a tab that was just put on screen): try again on the next frame.
    if (height === 0) {
      this.schedule();
      return;
    }
    const ratio = window.devicePixelRatio || 1;
    canvas.style.top = `${scroller.offsetTop}px`;
    canvas.style.height = `${height}px`;
    canvas.width = WIDTH * ratio;
    canvas.height = Math.max(1, Math.round(height * ratio));
    const paint = canvas.getContext("2d");
    if (!paint) return;
    paint.clearRect(0, 0, canvas.width, canvas.height);
    // Nothing to point at when the whole file fits on screen.
    if (total <= height + 1) return;

    const style = getComputedStyle(view.dom);
    const colour = (name: string) => style.getPropertyValue(name).trim() || "#ff4fa3";
    const top = view.documentPadding.top;
    const y = (pos: number) => Math.round(((view.lineBlockAt(pos).top + top) / total) * height * ratio);
    const state = view.state;
    const mark = (pos: number, fill: string, x: number, w: number, h: number) => {
      paint.fillStyle = fill;
      paint.fillRect(x * ratio, Math.min(canvas.height - h * ratio, y(pos)), w * ratio, h * ratio);
    };

    for (let style = 1; style <= 5; style += 1) {
      const fill = colour(`--tab-${style}`);
      let last = -10;
      for (const span of markedSpans(state, style)) {
        const at = y(span.from);
        if (at - last < 2 * ratio) continue;
        last = at;
        mark(span.from, fill, 6, 5, 2);
      }
    }

    const matches = scrollSearch.matches(state);
    if (matches) {
      const fill = colour("--sun-top");
      let last = -10;
      for (const pos of matches) {
        const at = y(pos);
        if (at - last < 2 * ratio) continue;
        last = at;
        mark(pos, fill, 1, WIDTH - 2, 2);
      }
    }

    const accent = colour("--accent");
    for (const pos of bookmarkPositions(state)) mark(pos, accent, 0, 4, 3);

    // Where the cursor is, as a thin line across the track.
    mark(state.selection.main.head, colour("--ed-cursor"), 0, WIDTH, 1);
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.canvas.remove();
  }
}

export const scrollMarks = ViewPlugin.fromClass(ScrollMarks);
