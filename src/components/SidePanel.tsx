import { CaretDown, CaretRight, File, Folder, FolderOpen, X } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { command, focusEditor } from "../commands";
import { snapshot } from "../editor/core";
import { gotoLine } from "../editops";
import * as files from "../files";
import { outline, supportsOutline } from "../funclist";
import * as platform from "../platform";
import { set, type SidePanel as Panel, useStore } from "../store";
import { Sunset } from "./Art";

const titles: Record<Exclude<Panel, "none">, string> = {
  folder: "Folder workspace",
  docs: "Document list",
  functions: "Function list",
};

function TreeNode({ entry, depth }: { entry: platform.DirEntry; depth: number }) {
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<platform.DirEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    if (!entry.is_dir) {
      await files.openPaths([entry.path]);
      return;
    }
    setOpen(!open);
    if (!children) {
      try {
        setChildren(await platform.listDir(entry.path));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : String(caught));
      }
    }
  };

  return (
    <li role="treeitem" aria-expanded={entry.is_dir ? open : undefined}>
      <button type="button" className="tree-row" style={{ paddingLeft: 8 + depth * 14 }} title={entry.path} onClick={() => void toggle()}>
        {entry.is_dir ? open ? <CaretDown size={11} weight="bold" /> : <CaretRight size={11} weight="bold" /> : <span className="tree-gap" />}
        {entry.is_dir ? open ? <FolderOpen size={15} weight="duotone" /> : <Folder size={15} weight="duotone" /> : <File size={15} />}
        <span className="tree-name">{entry.name}</span>
      </button>
      {open && error ? <p className="tree-error">{error}</p> : null}
      {open && children ? (
        <ul role="group">
          {children.map((child) => (
            <TreeNode key={child.path} entry={child} depth={depth + 1} />
          ))}
          {children.length === 0 ? (
            <li className="tree-empty" style={{ paddingLeft: 30 + depth * 14 }}>
              Empty folder
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

function FolderTree() {
  const workspace = useStore((s) => s.workspace);
  const [entries, setEntries] = useState<platform.DirEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEntries(null);
    setError(null);
    if (!workspace) return;
    let live = true;
    platform
      .listDir(workspace)
      .then((list) => live && setEntries(list))
      .catch((caught: unknown) => live && setError(caught instanceof Error ? caught.message : String(caught)));
    return () => {
      live = false;
    };
  }, [workspace]);

  if (!workspace) {
    return (
      <div className="side-empty">
        <Sunset className="side-art" />
        <h3>No folder open</h3>
        <p>Open a folder to browse its files here and search across them.</p>
        <button type="button" className="btn btn-go" onClick={() => void command("file.openFolder")?.run()}>
          Open folder
        </button>
      </div>
    );
  }

  return (
    <>
      <p className="side-path" title={workspace}>
        {workspace.split(/[\\/]/).pop() || workspace}
      </p>
      {error ? <p className="tree-error">{error}</p> : null}
      {!entries && !error ? (
        <ul className="skeleton" aria-label="Loading folder">
          {[72, 54, 86, 40, 64].map((width) => (
            <li key={width} style={{ width: `${width}%` }} />
          ))}
        </ul>
      ) : null}
      {entries ? (
        <ul className="tree" role="tree">
          {entries.map((entry) => (
            <TreeNode key={entry.path} entry={entry} depth={0} />
          ))}
        </ul>
      ) : null}
    </>
  );
}

function DocList() {
  const docs = useStore((s) => s.docs);
  const activeId = useStore((s) => s.activeId);
  return (
    <ul className="doc-list">
      {docs.map((doc) => (
        <li key={doc.id}>
          <button
            type="button"
            className={`doc-row${doc.id === activeId ? " is-active" : ""}`}
            title={doc.path ?? doc.name}
            onClick={() => files.activate(doc.id)}
            onAuxClick={(event) => {
              if (event.button === 1) void files.closeDoc(doc.id);
            }}
          >
            <span className={`doc-dot${doc.dirty ? " is-dirty" : ""}`} />
            <span className="doc-name">{doc.name}</span>
            <span className="doc-path">{doc.path ? doc.path.replace(/[\\/][^\\/]*$/, "") : "not saved yet"}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function FunctionList() {
  const activeId = useStore((s) => s.activeId);
  const language = useStore((s) => s.docs.find((d) => d.id === s.activeId)?.lang ?? "");
  const version = useStore((s) => s.textVersion);
  const [filter, setFilter] = useState("");

  const symbols = useMemo(() => {
    const text = snapshot(activeId)?.text ?? "";
    return outline(text, language);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, language, version]);

  if (!supportsOutline(language)) {
    return (
      <div className="side-empty">
        <h3>No outline for {language || "this file"}</h3>
        <p>The function list reads code, Markdown headings and config sections. Pick a language from the status bar if this file has one.</p>
      </div>
    );
  }

  const shown = filter ? symbols.filter((symbol) => symbol.name.toLowerCase().includes(filter.toLowerCase())) : symbols;
  return (
    <>
      <input className="side-filter" value={filter} placeholder="Filter names" aria-label="Filter names" onChange={(event) => setFilter(event.target.value)} />
      {shown.length === 0 ? <p className="empty">{symbols.length ? "No name matches the filter." : "Nothing to list in this file yet."}</p> : null}
      <ul className="symbol-list">
        {shown.map((symbol) => (
          <li key={`${symbol.line}-${symbol.name}`}>
            <button type="button" className="symbol-row" onClick={() => gotoLine(symbol.line)}>
              <span className={`symbol-kind kind-${symbol.kind}`}>{symbol.kind}</span>
              <span className="symbol-name">{symbol.name}</span>
              <span className="symbol-line">{symbol.line}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

export function SidePanel() {
  const side = useStore((s) => s.side);
  if (side === "none") return null;
  return (
    <aside className="side" aria-label={titles[side]}>
      <header className="side-head">
        <div className="seg seg-small" role="tablist">
          {(Object.keys(titles) as Exclude<Panel, "none">[]).map((panel) => (
            <button key={panel} type="button" role="tab" aria-selected={side === panel} className={side === panel ? "is-on" : ""} onClick={() => set({ side: panel })}>
              {panel === "folder" ? "Folder" : panel === "docs" ? "Open" : "Outline"}
            </button>
          ))}
        </div>
        <button type="button" className="icon-btn" aria-label="Close side panel" onClick={() => (set({ side: "none" }), focusEditor())}>
          <X size={15} weight="bold" />
        </button>
      </header>
      <div className="side-body">
        {side === "folder" ? <FolderTree /> : null}
        {side === "docs" ? <DocList /> : null}
        {side === "functions" ? <FunctionList /> : null}
      </div>
    </aside>
  );
}
