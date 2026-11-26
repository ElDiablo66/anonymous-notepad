import { ArrowDown, ArrowUp, ArrowsDownUp, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { focusEditor } from "../commands";
import { gotoLine } from "../editops";
import * as files from "../files";
import * as platform from "../platform";
import * as search from "../search";
import { previewReplace } from "./ReplacePreview";
import { activeDoc, type FindTab, get, type Hit, set, useStore } from "../store";

const tabs: { id: FindTab; label: string }[] = [
  { id: "find", label: "Find" },
  { id: "replace", label: "Replace" },
  { id: "files", label: "Find in files" },
  { id: "replaceFiles", label: "Replace in files" },
  { id: "mark", label: "Mark" },
];

function plural(count: number, word: string): string {
  return `${count.toLocaleString()} ${word}${count === 1 ? "" : "es"}`;
}

export function FindPanel() {
  const tab = useStore((s) => s.findTab);
  const nonce = useStore((s) => s.findNonce);
  const workspace = useStore((s) => s.workspace);
  const [options, setOptions] = useState<search.FindOptions>({ ...search.lastFind });
  const [message, setMessage] = useState<{ text: string; bad?: boolean } | null>(null);
  const [filters, setFilters] = useState("*.*");
  const [directory, setDirectory] = useState("");
  const [subfolders, setSubfolders] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [markStyle, setMarkStyle] = useState(1);
  const [bookmarkLines, setBookmarkLines] = useState(false);
  const [purge, setPurge] = useState(true);
  const [busy, setBusy] = useState(false);
  const whatRef = useRef<HTMLInputElement>(null);

  const update = (patch: Partial<search.FindOptions>) => {
    setOptions((current) => {
      const next = { ...current, ...patch };
      Object.assign(search.lastFind, next);
      queueMicrotask(search.searchChanged);
      return next;
    });
    setMessage(null);
  };

  useEffect(() => {
    const seed = search.selectionSeed();
    if (seed) update({ what: seed });
    whatRef.current?.focus();
    whatRef.current?.select();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce]);

  useEffect(() => {
    if (directory) return;
    const path = activeDoc()?.path;
    setDirectory(workspace ?? (path ? path.replace(/[\\/][^\\/]*$/, "") : ""));
  }, [workspace, directory, tab]);

  const report = (outcome: search.FindOutcome) => {
    if (outcome === "invalid") setMessage({ text: "The pattern is not a valid regular expression", bad: true });
    else if (outcome === "none") setMessage({ text: `"${options.what}" was not found`, bad: true });
    else if (outcome === "wrapped") setMessage({ text: "Wrapped around to the other end" });
    else setMessage(null);
  };

  const showResults = (title: string, hits: Hit[], note?: string) => {
    set({ results: { title, hits, note }, bottom: "results" });
  };

  const findAll = async (everyOpenDoc: boolean) => {
    if (everyOpenDoc) await files.loadAll();
    const hits = search.findAll(options, everyOpenDoc);
    if (!hits) return report("invalid");
    showResults(`"${options.what}" in ${everyOpenDoc ? "open files" : (activeDoc()?.name ?? "this file")}`, hits);
  };

  const inFiles = tab === "files" || tab === "replaceFiles";

  const folderOptions = (): platform.FindOptions => ({
    dir: directory,
    what: options.what,
    mode: options.mode,
    matchCase: options.matchCase,
    wholeWord: options.wholeWord,
    filters: filters === "*.*" ? "" : filters,
    subfolders,
    hidden,
    maxHits: 5000,
  });

  const replaceInFiles = async () => {
    if (!options.what) return;
    if (!directory) return setMessage({ text: "Choose a folder to search", bad: true });
    setBusy(true);
    setMessage({ text: "Working out the changes…" });
    try {
      await previewReplace(folderOptions(), options.replace);
      setMessage(null);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : String(error), bad: true });
    } finally {
      setBusy(false);
    }
  };

  const findInFiles = async () => {
    if (!options.what) return;
    if (!directory) return setMessage({ text: "Choose a folder to search", bad: true });
    setBusy(true);
    setMessage({ text: "Searching…" });
    try {
      const result = await platform.findInFiles(folderOptions());
      const hits: Hit[] = result.hits.map((hit) => ({ ...hit, label: hit.path }));
      const note = `${result.files_with_hits} of ${result.files_searched} files${result.truncated ? ", stopped at 5,000 matches" : ""}`;
      showResults(`"${options.what}" in ${directory}`, hits, note);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : String(error), bad: true });
    } finally {
      setBusy(false);
    }
  };

  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (tab === "files") void findInFiles();
      else if (tab === "replaceFiles") void replaceInFiles();
      else if (tab === "mark") runMark();
      else report(search.findNext(options, event.shiftKey));
    } else if (event.key === "Escape") {
      set({ bottom: "none" });
      focusEditor();
    }
  };

  const runMark = () => {
    const total = search.markAll(options, markStyle, bookmarkLines, purge);
    if (total === null) report("invalid");
    else setMessage({ text: `${plural(total, "match")} marked`, bad: total === 0 });
  };

  const check = (label: string, checked: boolean, onChange: (value: boolean) => void) => (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );

  return (
    <section className="dock find" aria-label="Find and replace" onKeyDown={onKey}>
      <header className="dock-head">
        <div className="seg" role="tablist">
          {tabs.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={tab === entry.id}
              className={tab === entry.id ? "is-on" : ""}
              onClick={() => set({ findTab: entry.id })}
            >
              {entry.label}
            </button>
          ))}
        </div>
        {message ? (
          <p className={`find-note${message.bad ? " is-bad" : ""}`} role="status">
            {message.text}
          </p>
        ) : null}
        <button type="button" className="icon-btn" aria-label="Close find" onClick={() => (set({ bottom: "none" }), focusEditor())}>
          <X size={15} weight="bold" />
        </button>
      </header>

      <div className="find-body">
        <div className="find-fields">
          <label className="field">
            <span>Find what</span>
            <input
              ref={whatRef}
              value={options.what}
              spellCheck={false}
              onChange={(event) => update({ what: event.target.value })}
            />
          </label>
          {tab === "replaceFiles" ? (
            <label className="field">
              <span>Replace with</span>
              <input value={options.replace} spellCheck={false} onChange={(event) => update({ replace: event.target.value })} />
            </label>
          ) : null}
          {tab === "replace" || inFiles ? (
            <label className={`field${inFiles ? " is-muted" : ""}`}>
              <span>{inFiles ? "Filters" : "Replace with"}</span>
              {inFiles ? (
                <input value={filters} spellCheck={false} placeholder="*.txt; *.md; !*.log" onChange={(event) => setFilters(event.target.value)} />
              ) : (
                <input value={options.replace} spellCheck={false} onChange={(event) => update({ replace: event.target.value })} />
              )}
            </label>
          ) : null}
          {inFiles ? (
            <label className="field">
              <span>Folder</span>
              <input value={directory} spellCheck={false} onChange={(event) => setDirectory(event.target.value)} />
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  const folder = await platform.pickFolder();
                  if (folder) setDirectory(folder);
                }}
              >
                Browse
              </button>
            </label>
          ) : null}
          {tab === "mark" ? (
            <div className="field">
              <span>Colour</span>
              <div className="swatches">
                {[1, 2, 3, 4, 5].map((style) => (
                  <button
                    key={style}
                    type="button"
                    aria-label={`Colour ${style}`}
                    aria-pressed={markStyle === style}
                    className={`swatch swatch-${style}${markStyle === style ? " is-on" : ""}`}
                    onClick={() => setMarkStyle(style)}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className="find-options">
            {check("Match case", options.matchCase, (v) => update({ matchCase: v }))}
            {check("Whole word", options.wholeWord, (v) => update({ wholeWord: v }))}
            {!inFiles ? check("Wrap around", options.wrap, (v) => update({ wrap: v })) : null}
            {!inFiles ? check("In selection", options.inSelection, (v) => update({ inSelection: v })) : null}
            {inFiles ? check("Sub-folders", subfolders, setSubfolders) : null}
            {inFiles ? check("Hidden folders", hidden, setHidden) : null}
            {tab === "mark" ? check("Bookmark lines", bookmarkLines, setBookmarkLines) : null}
            {tab === "mark" ? check("Clear this colour first", purge, setPurge) : null}
            <div className="seg seg-small" role="radiogroup" aria-label="Search mode">
              {(["normal", "extended", "regex"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={options.mode === mode}
                  className={options.mode === mode ? "is-on" : ""}
                  title={mode === "extended" ? "Understands \\n, \\r, \\t, \\0 and \\x41" : undefined}
                  onClick={() => update({ mode })}
                >
                  {mode === "normal" ? "Normal" : mode === "extended" ? "Extended" : "Regex"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="find-actions">
          {tab === "find" || tab === "replace" ? (
            <div className="btn-row">
              <button type="button" className="btn btn-go" onClick={() => report(search.findNext(options))}>
                <ArrowDown size={14} weight="bold" /> Find next
              </button>
              <button type="button" className="btn" aria-label="Find previous" title="Find previous (Shift+Enter)" onClick={() => report(search.findNext(options, true))}>
                <ArrowUp size={14} weight="bold" />
              </button>
            </div>
          ) : null}
          {tab === "find" ? (
            <>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const total = search.count(options);
                  if (total === null) report("invalid");
                  else setMessage({ text: plural(total, "match"), bad: total === 0 });
                }}
              >
                Count
              </button>
              <button type="button" className="btn" onClick={() => void findAll(false)}>
                Find all in this file
              </button>
              <button type="button" className="btn" onClick={() => void findAll(true)}>
                Find all in open files
              </button>
            </>
          ) : null}
          {tab === "replace" ? (
            <>
              <div className="btn-row">
                <button type="button" className="btn" onClick={() => report(search.replaceOne(options))}>
                  Replace
                </button>
                <button
                  type="button"
                  className="btn"
                  aria-label="Swap find and replace"
                  title="Swap find and replace"
                  onClick={() => update({ what: options.replace, replace: options.what })}
                >
                  <ArrowsDownUp size={14} weight="bold" />
                </button>
              </div>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const total = search.replaceAll(options);
                  setMessage({ text: `${plural(total, "match")} replaced`, bad: total === 0 });
                }}
              >
                Replace all
              </button>
              <button
                type="button"
                className="btn"
                onClick={async () => {
                  await files.loadAll();
                  const total = search.replaceAllOpen(options);
                  setMessage({ text: `${plural(total, "match")} replaced in ${get().docs.length} open files`, bad: total === 0 });
                }}
              >
                Replace all in open files
              </button>
            </>
          ) : null}
          {tab === "files" ? (
            <button type="button" className="btn btn-go" disabled={busy} onClick={() => void findInFiles()}>
              {busy ? "Searching…" : "Find all"}
            </button>
          ) : null}
          {tab === "replaceFiles" ? (
            <>
              <button type="button" className="btn btn-go" disabled={busy} onClick={() => void replaceInFiles()}>
                {busy ? "Working out the changes…" : "Preview changes"}
              </button>
              <p className="find-hint">Nothing is written until you confirm the preview.</p>
            </>
          ) : null}
          {tab === "mark" ? (
            <>
              <button type="button" className="btn btn-go" onClick={runMark}>
                Mark all
              </button>
              <button type="button" className="btn" onClick={() => (search.clearStyle(markStyle), setMessage({ text: "Colour cleared" }))}>
                Clear this colour
              </button>
              <button type="button" className="btn" onClick={() => (search.clearStyle(-1), setMessage({ text: "Every colour cleared" }))}>
                Clear all colours
              </button>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function ResultsPanel() {
  const results = useStore((s) => s.results);

  const open = async (hit: Hit) => {
    if (hit.docId && get().docs.some((doc) => doc.id === hit.docId)) files.activate(hit.docId);
    else if (hit.path) await files.openPaths([hit.path]);
    else return;
    // The editor swaps documents on the next frame; jump once it has.
    requestAnimationFrame(() => requestAnimationFrame(() => gotoLine(hit.line, hit.col, hit.len)));
  };

  const groups = new Map<string, Hit[]>();
  for (const hit of results?.hits ?? []) groups.set(hit.label, [...(groups.get(hit.label) ?? []), hit]);

  return (
    <section className="dock results" aria-label="Search results">
      <header className="dock-head">
        <h2>
          {results ? results.title : "Search results"}
          {results ? (
            <span className="dock-count">
              {results.hits.length.toLocaleString()} {results.hits.length === 1 ? "match" : "matches"}
              {results.note ? ` · ${results.note}` : ""}
            </span>
          ) : null}
        </h2>
        <button type="button" className="icon-btn" aria-label="Close results" onClick={() => (set({ bottom: "none" }), focusEditor())}>
          <X size={15} weight="bold" />
        </button>
      </header>
      <div className="results-body">
        {!results ? <p className="empty">Results from Find all and Find in files show up here.</p> : null}
        {results && !results.hits.length ? <p className="empty">Nothing matched. Check the spelling, or switch off Match case and Whole word.</p> : null}
        {[...groups.entries()].map(([label, hits]) => (
          <details key={label} open>
            <summary>
              <span className="results-file">{label}</span>
              <span className="results-total">{hits.length}</span>
            </summary>
            {hits.map((hit, index) => (
              <button key={index} type="button" className="result" onClick={() => void open(hit)}>
                <span className="result-line">{hit.line}</span>
                <span className="result-text">
                  {hit.text.slice(0, hit.col)}
                  <mark>{hit.text.slice(hit.col, hit.col + hit.len)}</mark>
                  {hit.text.slice(hit.col + hit.len)}
                </span>
              </button>
            ))}
          </details>
        ))}
      </div>
    </section>
  );
}
