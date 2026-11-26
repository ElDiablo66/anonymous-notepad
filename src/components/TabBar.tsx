import { Plus, PushPin, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { MenuItem } from "../commands";
import * as files from "../files";
import { get, set, useStore } from "../store";
import { openContextMenu } from "./Menus";

const tabMenu: MenuItem[] = [
  "file.close",
  "file.closeOthers",
  "file.closeLeft",
  "file.closeRight",
  "file.closeUnchanged",
  "file.closeUnpinned",
  "-",
  "file.save",
  "file.saveAs",
  "file.rename",
  "file.reload",
  "file.trash",
  "-",
  "tab.pin",
  { label: "Tab colour", items: [1, 2, 3, 4, 5, 0].map((n) => `tab.color${n}`) },
  "edit.readOnly",
  "-",
  "edit.copyPath",
  "edit.copyName",
  "edit.copyDir",
  "file.reveal",
  "file.cmd",
];

export function TabBar() {
  const docs = useStore((s) => s.docs);
  const activeId = useStore((s) => s.activeId);
  const strip = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  useEffect(() => {
    strip.current?.querySelector(".tab.is-active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId, docs.length]);

  const drop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const list = [...get().docs];
    const from = list.findIndex((doc) => doc.id === dragId);
    const to = list.findIndex((doc) => doc.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    set({ docs: list });
  };

  return (
    <div className="tabbar">
      <div
        ref={strip}
        className="tab-strip"
        role="tablist"
        aria-label="Open files"
        onDoubleClick={(event) => {
          if (event.target === event.currentTarget) files.newDoc();
        }}
        onWheel={(event) => {
          if (event.deltaY && strip.current) strip.current.scrollLeft += event.deltaY;
        }}
      >
        {docs.map((doc) => (
          <div
            key={doc.id}
            role="tab"
            tabIndex={doc.id === activeId ? 0 : -1}
            aria-selected={doc.id === activeId}
            title={doc.path ?? doc.name}
            className={[
              "tab",
              doc.id === activeId ? "is-active" : "",
              doc.dirty ? "is-dirty" : "",
              doc.color ? `tab-color-${doc.color}` : "",
              overId === doc.id && dragId !== doc.id ? "is-drop" : "",
            ].join(" ")}
            draggable
            onDragStart={(event) => {
              setDragId(doc.id);
              event.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setOverId(doc.id);
            }}
            onDrop={() => drop(doc.id)}
            onDragEnd={() => {
              setDragId(null);
              setOverId(null);
            }}
            onMouseDown={(event) => {
              if (event.button === 0) files.activate(doc.id);
            }}
            onAuxClick={(event) => {
              if (event.button === 1) void files.closeDoc(doc.id);
            }}
            onContextMenu={(event) => {
              files.activate(doc.id);
              openContextMenu(event, tabMenu);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") files.activate(doc.id);
            }}
          >
            {doc.pinned ? <PushPin size={12} weight="fill" className="tab-pin" aria-label="Pinned" /> : null}
            <span className="tab-name">{doc.name}</span>
            {doc.readOnly ? <span className="tab-flag">read-only</span> : null}
            <button
              type="button"
              className="tab-close"
              aria-label={doc.dirty ? `Close ${doc.name}, unsaved` : `Close ${doc.name}`}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => void files.closeDoc(doc.id)}
            >
              <span className="tab-dot" />
              <X size={12} weight="bold" />
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="tab-new" aria-label="New tab" title="New (Ctrl+N)" onClick={() => files.newDoc()}>
        <Plus size={15} weight="bold" />
      </button>
    </div>
  );
}
