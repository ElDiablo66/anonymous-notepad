import { useEffect, useRef } from "react";
import { handleKey, type MenuItem } from "./commands";
import { ContextMenu, MenuBar, openContextMenu } from "./components/Menus";
import { Logo, Sunset } from "./components/Art";
import { FindPanel, ResultsPanel } from "./components/FindPanel";
import { AskDialog, Picker, Sheet, Toast } from "./components/Overlays";
import { SidePanel } from "./components/SidePanel";
import { StatusBar } from "./components/StatusBar";
import { TabBar } from "./components/TabBar";
import { applySettings, hooks, mount, remeasure, show, unmount } from "./editor/core";
import * as files from "./files";
import * as platform from "./platform";
import { onChange, patchDoc, set, useStore } from "./store";

const editorMenu: MenuItem[] = [
  "edit.cut",
  "edit.copy",
  "edit.paste",
  "edit.delete",
  "edit.selectAll",
  "-",
  { label: "Convert case", items: ["case.upper", "case.lower", "case.proper", "case.sentence", "case.invert"] },
  "edit.toggleComment",
  "edit.blockComment",
  "-",
  { label: "Colour occurrences", items: [1, 2, 3, 4, 5].map((n) => `style.mark${n}`) },
  "style.clearAll",
  "bookmark.toggle",
  "-",
  "edit.searchWeb",
  "search.selectedNext",
];

function EditorPane() {
  const host = useRef<HTMLDivElement>(null);
  const activeId = useStore((s) => s.activeId);
  const doc = useStore((s) => s.docs.find((d) => d.id === s.activeId));
  const art = useStore((s) => s.settings.backgroundArt);

  useEffect(() => {
    if (!host.current) return;
    mount(host.current);
    return unmount;
  }, []);

  useEffect(() => {
    if (activeId) show(activeId);
  }, [activeId]);

  return (
    <main className="editor-area">
      {doc?.changedOnDisk ? (
        <div className="banner" role="alert">
          <p>
            <strong>{doc.name}</strong> changed on disk while you have unsaved edits here.
          </p>
          <button type="button" className="btn btn-go" onClick={() => void files.reload(doc.id)}>
            Reload from disk
          </button>
          <button type="button" className="btn" onClick={() => patchDoc(doc.id, { changedOnDisk: false })}>
            Keep my version
          </button>
        </div>
      ) : null}
      {art ? <Sunset className="editor-art" /> : null}
      <div ref={host} className="editor-host" onContextMenu={(event) => openContextMenu(event, editorMenu)} />
    </main>
  );
}

export function App() {
  const theme = useStore((s) => s.settings.theme);
  const fontSize = useStore((s) => s.settings.fontSize);
  const zen = useStore((s) => s.zen);
  const bottom = useStore((s) => s.bottom);
  const title = useStore((s) => {
    const doc = s.docs.find((d) => d.id === s.activeId);
    return doc ? `${doc.dirty ? "● " : ""}${doc.path ?? doc.name}` : "";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.setProperty("--ed-size", `${fontSize}px`);
    remeasure();
  }, [theme, fontSize]);

  useEffect(() => {
    // The code font arrives after the first paint and has different metrics from the fallback.
    void document.fonts.ready.then(remeasure);
    document.fonts.addEventListener("loadingdone", remeasure);
    return () => document.fonts.removeEventListener("loadingdone", remeasure);
  }, []);

  useEffect(() => {
    void platform.setTitle(title ? `${title} - Anonymous Notepad` : "Anonymous Notepad");
  }, [title]);

  useEffect(() => {
    hooks.onEdit = files.scheduleSessionSave;
    const stop = onChange(files.scheduleSessionSave);

    const onKey = (event: KeyboardEvent) => {
      if (handleKey(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const onFocus = () => void files.checkDisk();
    const onLeave = () => void files.saveSession();
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      set((s) => ({ settings: { ...s.settings, fontSize: Math.max(8, Math.min(40, s.settings.fontSize + (event.deltaY < 0 ? 1 : -1))) } }));
    };
    // The web view's own right-click menu (reload, inspect) only makes sense in text fields.
    const onContext = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest("input, textarea")) event.preventDefault();
    };
    window.addEventListener("contextmenu", onContext);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("focus", onFocus);
    window.addEventListener("beforeunload", onLeave);
    window.addEventListener("wheel", onWheel, { passive: false });

    void files.loadSession().then(() => applySettings());
    void platform.onFilesOpened((paths) => void files.openPaths(paths));
    void platform.onCloseRequested(() => {
      void files.saveSession().finally(() => void platform.closeWindow());
    });

    return () => {
      stop();
      window.removeEventListener("contextmenu", onContext);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("beforeunload", onLeave);
      window.removeEventListener("wheel", onWheel);
    };
  }, []);

  return (
    <div className={`app${zen ? " is-zen" : ""}`}>
      <a className="skip" href="#editor">
        Skip to the editor
      </a>
      <header className="topbar">
        <div className="brand">
          <Logo />
          <span className="wordmark">Anonymous Notepad</span>
        </div>
        <MenuBar />
      </header>
      <TabBar />
      <div className="workspace" id="editor">
        <SidePanel />
        <div className="center">
          <EditorPane />
          {bottom === "find" ? <FindPanel /> : null}
          {bottom === "results" ? <ResultsPanel /> : null}
        </div>
        <Sheet />
      </div>
      <StatusBar />
      <ContextMenu />
      <Picker />
      <AskDialog />
      <Toast />
    </div>
  );
}
