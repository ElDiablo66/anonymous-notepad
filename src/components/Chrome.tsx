// The icon toolbar, the start screen and the station dial that switches themes.

import {
  ArrowClockwise,
  ArrowCounterClockwise,
  Command as CommandIcon,
  FilePlus,
  Files,
  FloppyDisk,
  FloppyDiskBack,
  FolderOpen,
  GearSix,
  MagnifyingGlass,
  Paragraph,
  Radio,
  SidebarSimple,
  Swap,
  TextAlignLeft,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { command, focusEditor } from "../commands";
import { demoPanel } from "../demo";
import * as files from "../files";
import { setSetting, useStore } from "../store";
import { DIAL_END, DIAL_START, neighbour, stationFor, stations, type ThemeId } from "../themes";
import { Postcard } from "./Art";

type IconType = typeof FilePlus;

const tools: ([id: string, icon: IconType] | null)[] = [
  ["file.new", FilePlus],
  ["file.open", FolderOpen],
  ["file.save", FloppyDisk],
  ["file.saveAll", FloppyDiskBack],
  null,
  ["edit.undo", ArrowCounterClockwise],
  ["edit.redo", ArrowClockwise],
  null,
  ["search.find", MagnifyingGlass],
  ["search.replace", Swap],
  ["search.findInFiles", Files],
  null,
  ["view.wrap", TextAlignLeft],
  ["view.whitespace", Paragraph],
  ["view.folder", SidebarSimple],
  null,
  ["view.palette", CommandIcon],
  ["settings.preferences", GearSix],
];

export function Toolbar() {
  // Subscribing to these keeps the pressed state of the toggle buttons current.
  useStore((s) => s.settings);
  useStore((s) => s.side);
  return (
    <div className="toolbar" role="toolbar" aria-label="Quick actions">
      {tools.map((tool, index) => {
        if (!tool) return <span key={index} className="toolbar-gap" />;
        const [id, Icon] = tool;
        const entry = command(id);
        if (!entry) return null;
        const pressed = entry.checked?.();
        const label = entry.title.replace("…", "");
        return (
          <button
            key={id}
            type="button"
            className={`tool${pressed ? " is-on" : ""}`}
            aria-label={label}
            aria-pressed={entry.checked ? pressed : undefined}
            title={entry.keys ? `${label} (${entry.keys})` : label}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              focusEditor();
              void entry.run();
            }}
          >
            <Icon size={17} weight="duotone" />
          </button>
        );
      })}
    </div>
  );
}

export function tune(id: ThemeId): void {
  setSetting("theme", id);
}

/** A radio dial in the status bar. Each theme is a station. */
export function StationDial() {
  const theme = useStore((s) => s.settings.theme);
  const [open, setOpen] = useState(demoPanel === "tuner");
  const box = useRef<HTMLDivElement>(null);
  const current = stationFor(theme);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        focusEditor();
      }
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const place = (frequency: number) => `${((frequency - DIAL_START) / (DIAL_END - DIAL_START)) * 100}%`;

  return (
    <div ref={box} className="station">
      <button
        type="button"
        className="station-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Change theme (Ctrl+Alt+T tunes to the next one)"
        onClick={() => setOpen(!open)}
      >
        <Radio size={14} weight="duotone" />
        <span className="station-freq">{current.frequency.toFixed(1)}</span>
        <span>{current.name}</span>
      </button>
      {open ? (
        <div
          className="tuner"
          role="dialog"
          aria-label="Theme stations"
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowDown") (event.preventDefault(), tune(neighbour(theme, 1).id));
            if (event.key === "ArrowLeft" || event.key === "ArrowUp") (event.preventDefault(), tune(neighbour(theme, -1).id));
          }}
        >
          <div className="dial" aria-hidden="true">
            <div className="dial-ticks" />
            {stations.map((station) => (
              <span key={station.id} className="dial-mark" style={{ left: place(station.frequency) }} />
            ))}
            <span className="dial-needle" style={{ left: place(current.frequency) }} />
            <span className="dial-scale">
              <span>88</span>
              <span>92</span>
              <span>96</span>
              <span>100</span>
              <span>104</span>
              <span>108</span>
            </span>
          </div>
          <ul role="radiogroup" aria-label="Stations">
            {stations.map((station) => (
              <li key={station.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={station.id === theme}
                  autoFocus={station.id === theme}
                  className={`station-row station-${station.id}${station.id === theme ? " is-on" : ""}`}
                  onClick={() => tune(station.id)}
                >
                  <span className="station-chip" />
                  <span className="station-freq">{station.frequency.toFixed(1)}</span>
                  <span className="station-name">
                    <strong>{station.name}</strong>
                    <small>{station.note}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function folderName(path: string): string {
  return path.replace(/[\\/][^\\/]*$/, "");
}

const starts: [id: string, label: string][] = [
  ["file.new", "New file"],
  ["file.open", "Open a file"],
  ["file.openFolder", "Open a folder"],
  ["view.palette", "Every command"],
];

/**
 * Shown over an empty first tab. Only its buttons take the mouse, so the
 * editor underneath still gets clicks and typing; the first character hides it.
 */
export function StartScreen() {
  const recent = useStore((s) => s.recent);
  return (
    <section className="start" aria-label="Start">
      <div className="start-card">
        <Postcard className="start-art" label="A striped sun setting behind a city skyline and palm trees" />
        <div className="start-copy">
          <p className="start-kicker">Text and code editor</p>
          <h1 className="wordmark">Anonymous Notepad</h1>
          <p className="start-line">No account, no cloud, no assistant. Start typing, or pick up where you left off.</p>
        </div>
      </div>
      <div className="start-columns">
        <div>
          <h2>Start</h2>
          <ul>
            {starts.map(([id, label]) => {
              const entry = command(id);
              return (
                <li key={id}>
                  <button type="button" className="start-row" onClick={() => void entry?.run()}>
                    <span>{label}</span>
                    {entry?.keys ? <kbd>{entry.keys}</kbd> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <h2>Recent</h2>
          {recent.length === 0 ? <p className="start-empty">Files you open show up here.</p> : null}
          <ul>
            {recent.slice(0, 6).map((path) => (
              <li key={path}>
                <button type="button" className="start-row" title={path} onClick={() => void files.openPaths([path])}>
                  <span>{fileName(path)}</span>
                  <small>{folderName(path)}</small>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
