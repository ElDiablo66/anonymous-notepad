import { useEffect, useRef, useState } from "react";
import { handleKey, type MenuItem } from "./commands";
import { ContextMenu, MenuBar, openContextMenu } from "./components/Menus";
import { Logo, Postcard, Sunset } from "./components/Art";
import { BigViewer } from "./components/BigViewer";
import { StartScreen, Toolbar } from "./components/Chrome";
import { FindPanel, ResultsPanel } from "./components/FindPanel";
import { AskDialog, Picker, Sheet, Toast } from "./components/Overlays";
import { SidePanel } from "./components/SidePanel";
import { StatusBar } from "./components/StatusBar";
import { TabBar } from "./components/TabBar";
import { applySettings, hooks, mount, remeasure, show, unmount } from "./editor/core";
import { demo, demoPanel, seedDemo } from "./demo";
import * as files from "./files";
import * as platform from "./platform";
import { installUpdate, watchForUpdates } from "./updates";
import { setUiScale, sizeForWindow } from "./scale";
import { get, onChange, patchDoc, set, useStore } from "./store";

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
  const update = useStore((s) => s.update);
  const [updateLater, setUpdateLater] = useState("");
  const start = useStore(
    (s) => s.settings.startScreen && s.docs.length === 1 && !s.docs[0].path && !s.docs[0].dirty && s.cursor.length === 0 && s.sheet === null,
  );

  useEffect(() => {
    if (!host.current) return;
    mount(host.current);
    return unmount;
  }, []);

  useEffect(() => {
    if (!activeId) return;
    const id = activeId;
    // A tab restored from the last session reads its file here, the first time it is shown.
    void files.ensureLoaded(id).then(() => {
      if (get().activeId === id) show(id);
    });
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
      {update && updateLater !== update.version ? (
        <div className="banner banner-update" role="status">
          <p>
            Version <strong>{update.version}</strong> is out. Your tabs, unsaved text included, come back after the restart.
          </p>
          <button type="button" className="btn btn-go" disabled={update.busy} onClick={() => void installUpdate()}>
            {update.busy ? "Updating…" : "Update and restart"}
          </button>
          <button type="button" className="btn" disabled={update.busy} onClick={() => setUpdateLater(update.version)}>
            Later
          </button>
        </div>
      ) : null}
      {art && !start ? <Sunset className="editor-art" /> : null}
      {start ? <StartScreen /> : null}
      {doc?.big ? <BigViewer key={doc.id} doc={doc} /> : null}
      <div ref={host} className="editor-host" hidden={Boolean(doc?.big)} onContextMenu={(event) => openContextMenu(event, editorMenu)} />
    </main>
  );
}

export function App() {
  const theme = useStore((s) => s.settings.theme);
  const fontSize = useStore((s) => s.settings.fontSize);
  const glow = useStore((s) => s.settings.glow);
  const uiSize = useStore((s) => s.settings.uiSize);
  const [fitted, setFitted] = useState(sizeForWindow);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const ui = uiSize ?? fitted;
  const toolbar = useStore((s) => s.settings.toolbar);
  const zen = useStore((s) => s.zen);
  const bottom = useStore((s) => s.bottom);
  const title = useStore((s) => {
    const doc = s.docs.find((d) => d.id === s.activeId);
    return doc ? `${doc.dirty ? "● " : ""}${doc.path ?? doc.name}` : "";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.glow = glow;
    setUiScale(ui);
    document.documentElement.style.setProperty("--ed-size", `${fontSize * ui}px`);
    remeasure();
  }, [theme, fontSize, glow, ui]);

  useEffect(() => {
    // Media queries count real pixels; a larger interface size leaves fewer of them to work with.
    const room = windowWidth / ui;
    document.documentElement.dataset.width = room < 760 ? "tight" : room < 1080 ? "narrow" : "wide";
  }, [windowWidth, ui]);

  useEffect(() => {
    const refit = () => {
      setFitted(sizeForWindow());
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener("resize", refit);
    return () => window.removeEventListener("resize", refit);
  }, []);

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
    // The demo shows sample tabs in a browser and must not overwrite a real session.
    const keepSession = demo ? () => undefined : files.scheduleSessionSave;
    hooks.onEdit = keepSession;
    const stop = onChange(keepSession);

    const onKey = (event: KeyboardEvent) => {
      if (handleKey(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const onFocus = () => void files.checkDisk();
    const onLeave = () => {
      if (!demo) void files.saveSession();
    };
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
    const onBlur = () => {
      if (get().settings.saveOnBlur) void files.saveNamed();
    };
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    window.addEventListener("beforeunload", onLeave);
    window.addEventListener("wheel", onWheel, { passive: false });

    const stopUpdates = demo ? () => undefined : watchForUpdates();
    void (demo ? seedDemo() : files.loadSession()).then(() => {
      applySettings();
      const splash = document.getElementById("splash");
      splash?.classList.add("is-done");
      setTimeout(() => splash?.remove(), 300);
    });
    void platform.onFilesOpened((paths) => void files.openPaths(paths));
    void platform.onCloseRequested(() => {
      void files.saveSession().finally(() => void platform.closeWindow());
    });

    return () => {
      stopUpdates();
      stop();
      window.removeEventListener("contextmenu", onContext);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("beforeunload", onLeave);
      window.removeEventListener("wheel", onWheel);
    };
  }, []);

  // Demo only: the picture used at the top of the README.
  if (demoPanel === "banner") {
    return (
      <div className="banner-shot">
        <Postcard className="banner-art" />
        <div className="banner-copy">
          <h1 className="wordmark">Anonymous Notepad</h1>
          <p>A text and code editor with a neon sunset look</p>
        </div>
      </div>
    );
  }

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
        {toolbar ? <Toolbar /> : null}
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
