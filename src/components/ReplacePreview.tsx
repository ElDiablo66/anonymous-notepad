// The step between "replace in files" and the disk: every change is listed, files can be
// left out, and nothing is written until the button is pressed.

import { CheckSquare, Square, X } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { focusEditor } from "../commands";
import * as files from "../files";
import * as platform from "../platform";
import { get, set, toast, useStore } from "../store";

function sameFile(a: string, b: string): boolean {
  return a.replace(/\//g, "\\").toLowerCase() === b.replace(/\//g, "\\").toLowerCase();
}

export function ReplacePreview() {
  const preview = useStore((s) => s.replacePreview);
  const docs = useStore((s) => s.docs);
  const [left, setLeft] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<platform.Applied[] | null>(null);

  // A file open in a tab with unsaved edits would be overwritten under them, so it is held back.
  const blocked = useMemo(() => {
    const out = new Set<string>();
    for (const file of preview?.plan.files ?? []) {
      if (docs.some((doc) => doc.path && doc.dirty && sameFile(doc.path, file.path))) out.add(file.path);
    }
    return out;
  }, [preview, docs]);

  if (!preview) return null;
  const { plan } = preview;
  const chosen = plan.files.filter((file) => !left.has(file.path) && !blocked.has(file.path));
  const matches = chosen.reduce((sum, file) => sum + file.count, 0);

  const close = () => {
    set({ replacePreview: null, bottom: "find" });
    focusEditor();
  };

  const toggle = (path: string) => {
    const next = new Set(left);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setLeft(next);
  };

  const apply = async () => {
    if (!chosen.length) return;
    setBusy(true);
    try {
      const results = await platform.replaceApply(
        preview.options,
        preview.replace,
        chosen.map((file) => ({ path: file.path, fingerprint: file.fingerprint })),
      );
      setDone(results);
      const changed = results.filter((result) => !result.error);
      const count = changed.reduce((sum, result) => sum + result.count, 0);
      const failed = results.length - changed.length;
      toast(`${count.toLocaleString()} replaced in ${changed.length} ${changed.length === 1 ? "file" : "files"}${failed ? `, ${failed} left alone` : ""}`);
      // Open tabs without edits pick up the new text from disk.
      await files.checkDisk();
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    const failed = done.filter((result) => result.error);
    return (
      <section className="dock results" aria-label="Replace in files, done">
        <header className="dock-head">
          <h2>
            Replace finished
            <span className="dock-count">
              {(done.length - failed.length).toLocaleString()} files changed{failed.length ? ` · ${failed.length} left alone` : ""}
            </span>
          </h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={() => (set({ replacePreview: null, bottom: "none" }), focusEditor())}>
            <X size={15} weight="bold" />
          </button>
        </header>
        <div className="results-body">
          {failed.length === 0 ? <p className="empty">Every chosen file was changed. Ctrl+Z does not undo this; the files on disk are rewritten.</p> : null}
          {failed.map((result) => (
            <p key={result.path} className="rp-error">
              <span className="results-file">{result.path}</span>
              <span>{result.error}</span>
            </p>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="dock results rp" aria-label="Replace in files, preview">
      <header className="dock-head">
        <h2>
          Replace “{preview.options.what}” with “{preview.replace}”
          <span className="dock-count">
            {plan.total.toLocaleString()} matches in {plan.files.length.toLocaleString()} of {plan.files_searched.toLocaleString()} files
            {plan.truncated ? " · stopped at 2,000 files" : ""}
          </span>
        </h2>
        <div className="btn-row">
          <button type="button" className="btn" disabled={busy} onClick={() => setLeft(new Set(left.size ? [] : plan.files.map((file) => file.path)))}>
            {left.size ? "Choose all" : "Choose none"}
          </button>
          <button type="button" className="btn btn-go" disabled={busy || !chosen.length} onClick={() => void apply()}>
            {busy ? "Replacing…" : `Replace ${matches.toLocaleString()} in ${chosen.length.toLocaleString()} ${chosen.length === 1 ? "file" : "files"}`}
          </button>
        </div>
        <button type="button" className="icon-btn" aria-label="Cancel replace" onClick={close}>
          <X size={15} weight="bold" />
        </button>
      </header>
      <div className="results-body">
        {plan.files.length === 0 ? <p className="empty">Nothing matched, so nothing would change.</p> : null}
        {blocked.size ? (
          <p className="rp-warn">
            {blocked.size} {blocked.size === 1 ? "file is" : "files are"} open with unsaved edits and will be left alone. Save or close {blocked.size === 1 ? "it" : "them"} and preview again.
          </p>
        ) : null}
        {plan.files.map((file) => {
          const isBlocked = blocked.has(file.path);
          const on = !left.has(file.path) && !isBlocked;
          return (
            <details key={file.path} open={plan.files.length <= 30}>
              <summary className={on ? "" : "is-off"}>
                <button
                  type="button"
                  className="rp-check"
                  role="checkbox"
                  aria-checked={on}
                  aria-label={`Include ${file.path}`}
                  disabled={isBlocked}
                  onClick={(event) => {
                    event.preventDefault();
                    toggle(file.path);
                  }}
                >
                  {on ? <CheckSquare size={16} weight="fill" /> : <Square size={16} />}
                </button>
                <span className="results-file">{file.path}</span>
                <span className="results-total">{file.count}</span>
                {file.encoding !== "UTF-8" ? <span className="tab-flag">{file.encoding}</span> : null}
                {isBlocked ? <span className="tab-flag">unsaved in a tab</span> : null}
              </summary>
              {file.lines.map((line) => (
                <div key={line.line} className="rp-line">
                  <span className="result-line">{line.line}</span>
                  <span className="rp-before">{line.before}</span>
                  <span className="result-line" />
                  <span className="rp-after">{line.after}</span>
                </div>
              ))}
              {file.count > file.lines.length ? <p className="rp-more">and more matches in this file</p> : null}
            </details>
          );
        })}
      </div>
    </section>
  );
}

/** Asks the backend what replacing would change and opens the preview. */
export async function previewReplace(options: platform.FindOptions, replace: string): Promise<void> {
  const plan = await platform.replacePreview(options, replace);
  set({ replacePreview: { options, replace, plan }, bottom: "preview" });
  if (!get().replacePreview?.plan.files.length) toast("Nothing matched, so nothing would change");
}
