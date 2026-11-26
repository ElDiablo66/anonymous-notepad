// Read-only viewer for files too large for the editor. It asks the backend for
// just the lines on screen, so a multi-gigabyte log scrolls like a small file.

import { ArrowDown, ArrowUp } from "@phosphor-icons/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import * as files from "../files";
import * as platform from "../platform";
import { type Doc, useStore } from "../store";

/** Browsers cap how tall an element can be, so a long file's scroll range is squeezed into this. */
const MAX_SCROLL_PX = 12_000_000;

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function BigViewer({ doc }: { doc: Doc }) {
  const big = doc.big as NonNullable<Doc["big"]>;
  const fontSize = useStore((s) => s.settings.fontSize);
  const scroller = useRef<HTMLDivElement>(null);
  const findBox = useRef<HTMLInputElement>(null);
  const gotoBox = useRef<HTMLInputElement>(null);
  const expected = useRef(-1);
  const request = useRef(0);

  const [lineHeight, setLineHeight] = useState(22);
  const [rows, setRows] = useState(40);
  const [top, setTop] = useState(0);
  const [lines, setLines] = useState<string[]>([]);
  const [what, setWhat] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [hit, setHit] = useState<platform.BigHit | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const lastTop = Math.max(0, big.lines - Math.max(1, rows - 2));
  const fullHeight = Math.min(big.lines * lineHeight, MAX_SCROLL_PX);

  // Line height and how many rows fit follow the text size and the window.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const measure = () => {
      const height = Number.parseFloat(getComputedStyle(element).lineHeight) || 22;
      setLineHeight(height);
      setRows(Math.max(1, Math.ceil(element.clientHeight / height)));
    };
    measure();
    const watcher = new ResizeObserver(measure);
    watcher.observe(element);
    return () => watcher.disconnect();
  }, [fontSize]);

  useEffect(() => {
    const sequence = ++request.current;
    platform
      .bigRead(big.id, top, rows + 1)
      .then((text) => {
        if (sequence === request.current) setLines(text);
      })
      .catch((error: unknown) => setNote(error instanceof Error ? error.message : String(error)));
  }, [big.id, top, rows]);

  /** Moves to a line and puts the scrollbar where that line belongs. */
  const goTo = useCallback(
    (line: number) => {
      const next = Math.max(0, Math.min(lastTop, Math.round(line)));
      setTop(next);
      const element = scroller.current;
      if (!element) return;
      const range = fullHeight - element.clientHeight;
      const position = lastTop > 0 && range > 0 ? (next / lastTop) * range : 0;
      expected.current = position;
      element.scrollTop = position;
    },
    [fullHeight, lastTop],
  );

  const onScroll = () => {
    const element = scroller.current;
    if (!element) return;
    // A scroll this component caused itself must not be mapped back to a slightly different line.
    if (Math.abs(element.scrollTop - expected.current) < 2) return;
    expected.current = -1;
    const range = fullHeight - element.clientHeight;
    setTop(range > 0 ? Math.round((element.scrollTop / range) * lastTop) : 0);
  };

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    // The wheel moves by whole lines; the squeezed scrollbar alone would jump thousands at a time.
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.shiftKey) return;
      event.preventDefault();
      goTo(top + Math.sign(event.deltaY) * Math.max(3, Math.round(Math.abs(event.deltaY) / lineHeight)));
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [goTo, top, lineHeight]);

  useEffect(() => {
    const onFocus = (event: Event) => {
      const box = (event as CustomEvent<string>).detail === "goto" ? gotoBox.current : findBox.current;
      box?.focus();
      box?.select();
    };
    window.addEventListener("big-viewer-focus", onFocus);
    return () => window.removeEventListener("big-viewer-focus", onFocus);
  }, []);

  const find = async (backward: boolean) => {
    if (!what || busy) return;
    setBusy(true);
    setNote("");
    try {
      const search = (line: number, col: number) => platform.bigFind(big.id, what, matchCase, line, col, backward);
      let found = hit ? await search(hit.line, backward ? hit.col : hit.col + hit.len) : await search(top, 0);
      if (!found) {
        found = backward ? await search(big.lines - 1, Number.MAX_SAFE_INTEGER) : await search(0, 0);
        if (found) setNote("Wrapped around to the other end");
      }
      if (found) {
        setHit(found);
        goTo(found.line - Math.floor(rows / 3));
      } else {
        setHit(null);
        setNote(`"${what}" was not found`);
      }
    } catch (error) {
      setNote(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const onKey = (event: React.KeyboardEvent) => {
    const page = Math.max(1, rows - 2);
    if (event.key === "ArrowDown") goTo(top + 1);
    else if (event.key === "ArrowUp") goTo(top - 1);
    else if (event.key === "PageDown") goTo(top + page);
    else if (event.key === "PageUp") goTo(top - page);
    else if (event.key === "Home" && event.ctrlKey) goTo(0);
    else if (event.key === "End" && event.ctrlKey) goTo(lastTop);
    else return;
    event.preventDefault();
  };

  const digits = big.lines.toLocaleString().length;

  return (
    <div className="big">
      <header className="big-head">
        <p className="big-facts">
          <strong>Large-file viewer</strong>
          <span>
            {formatBytes(big.size)} · {big.lines.toLocaleString()} lines · read-only
          </span>
        </p>
        <label className="big-field">
          <span>Line</span>
          <input
            ref={gotoBox}
            inputMode="numeric"
            placeholder={(top + 1).toLocaleString()}
            aria-label="Go to line"
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              const line = Number.parseInt(event.currentTarget.value.replace(/\D/g, ""), 10);
              if (line > 0) goTo(line - 1);
            }}
          />
        </label>
        <label className="big-field big-find">
          <span>Find</span>
          <input
            ref={findBox}
            value={what}
            spellCheck={false}
            aria-label="Find in this file"
            onChange={(event) => {
              setWhat(event.target.value);
              setHit(null);
              setNote("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") void find(event.shiftKey);
            }}
          />
        </label>
        <div className="btn-row">
          <button type="button" className="btn" disabled={busy} aria-label="Find previous" title="Find previous (Shift+Enter)" onClick={() => void find(true)}>
            <ArrowUp size={14} weight="bold" />
          </button>
          <button type="button" className="btn" disabled={busy} aria-label="Find next" title="Find next (Enter)" onClick={() => void find(false)}>
            <ArrowDown size={14} weight="bold" />
          </button>
        </div>
        <label className="check">
          <input type="checkbox" checked={matchCase} onChange={(event) => (setMatchCase(event.target.checked), setHit(null))} />
          <span>Match case</span>
        </label>
        <p className={`big-note${note.includes("not found") ? " is-bad" : ""}`} role="status">
          {busy ? "Searching…" : note}
        </p>
        {big.size <= files.EDITOR_LIMIT ? (
          <button type="button" className="btn" title="Loads the whole file into memory so it can be edited" onClick={() => void files.openInEditor(doc.id)}>
            Open in the editor
          </button>
        ) : null}
      </header>
      <div ref={scroller} className="big-scroll" tabIndex={0} role="document" aria-label={`${doc.name}, read-only`} onScroll={onScroll} onKeyDown={onKey}>
        <div className="big-range" style={{ height: fullHeight }}>
          <div className="big-page" style={{ height: rows * lineHeight }}>
            {lines.map((text, index) => {
              const number = top + index;
              const marked = hit && hit.line === number;
              return (
                <div key={number} className={`big-line${marked ? " is-hit" : ""}`}>
                  <span className="big-number" style={{ minWidth: `${digits + 2}ch` }}>
                    {(number + 1).toLocaleString()}
                  </span>
                  <span className="big-text">
                    {marked ? (
                      <>
                        {text.slice(0, hit.col)}
                        <mark>{text.slice(hit.col, hit.col + hit.len)}</mark>
                        {text.slice(hit.col + hit.len)}
                      </>
                    ) : (
                      text
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
