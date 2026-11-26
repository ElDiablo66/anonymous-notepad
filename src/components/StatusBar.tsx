import type { MenuItem } from "../commands";
import { command, encodingLabel, pickLanguage } from "../commands";
import { set, useStore } from "../store";
import { openContextMenu } from "./Menus";

const eolNames = { CRLF: "Windows (CR LF)", LF: "Unix (LF)", CR: "Mac (CR)" } as const;
const eolMenu: MenuItem[] = ["eol.crlf", "eol.lf", "eol.cr"];
const encodingMenu: MenuItem[] = [
  "encoding.utf8",
  "encoding.utf8bom",
  "encoding.utf16le",
  "encoding.utf16be",
  "encoding.ansi",
  "-",
  "encoding.reopen",
];

function menuAbove(event: React.MouseEvent<HTMLElement>, items: MenuItem[]): void {
  const box = event.currentTarget.getBoundingClientRect();
  openContextMenu({ clientX: box.left, clientY: box.top - 6 - items.length * 28, preventDefault: () => event.preventDefault() }, items);
}

export function StatusBar() {
  const doc = useStore((s) => s.docs.find((d) => d.id === s.activeId));
  const cursor = useStore((s) => s.cursor);
  const overwrite = useStore((s) => s.overwrite);
  const tabSize = useStore((s) => s.settings.tabSize);
  const insertSpaces = useStore((s) => s.settings.insertSpaces);
  const fontSize = useStore((s) => s.settings.fontSize);
  if (!doc) return null;

  return (
    <footer className="statusbar">
      <button type="button" className="status-main" title="Choose language (Ctrl+Shift+G)" onClick={pickLanguage}>
        {doc.lang}
      </button>
      <span className="status-fill" />
      <span title="Characters and lines in this file">
        {cursor.length.toLocaleString()} chars · {cursor.lines.toLocaleString()} lines
      </span>
      <button type="button" title="Go to line (Ctrl+G)" onClick={() => void command("search.goto")?.run()}>
        Ln {cursor.line.toLocaleString()}, Col {cursor.col}
        {cursor.sel ? ` · Sel ${cursor.sel.toLocaleString()} | ${cursor.selLines}` : ""}
        {cursor.ranges > 1 ? ` · ${cursor.ranges} cursors` : ""}
      </button>
      <button type="button" title="Indentation, set in Preferences" onClick={() => set({ sheet: "preferences" })}>
        {insertSpaces ? "Spaces" : "Tab"}: {tabSize}
      </button>
      {fontSize !== 14 ? (
        <button type="button" title="Reset zoom (Ctrl+0)" onClick={() => void command("view.zoomReset")?.run()}>
          {Math.round((fontSize / 14) * 100)}%
        </button>
      ) : null}
      <button type="button" title="Line endings" onClick={(event) => menuAbove(event, eolMenu)}>
        {eolNames[doc.eol]}
      </button>
      <button type="button" title="Encoding" onClick={(event) => menuAbove(event, encodingMenu)}>
        {encodingLabel(doc.encoding, doc.bom)}
      </button>
      <button type="button" title="Typing mode (Insert key)" onClick={() => set((s) => ({ overwrite: !s.overwrite }))}>
        {overwrite ? "OVR" : "INS"}
      </button>
    </footer>
  );
}
