import { X } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { allCommands, focusEditor } from "../commands";
import { applySettings, getView, snapshot } from "../editor/core";
import { columnInsert, selectedText } from "../editops";
import * as platform from "../platform";
import { sizeForWindow, sizes } from "../scale";
import { activeDoc, defaultSettings, set, setSetting, type Settings, type SheetName, toast, useStore } from "../store";
import { numberColumn, summarize } from "../textops";
import { stations } from "../themes";
import { Logo, Postcard } from "./Art";

declare const __APP_VERSION__: string;

export function Picker() {
  const picker = useStore((s) => s.picker);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    setQuery("");
    setIndex(0);
  }, [picker]);

  const shown = useMemo(() => {
    if (!picker) return [];
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return picker.items.filter((item) => words.every((word) => item.label.toLowerCase().includes(word))).slice(0, 200);
  }, [picker, query]);

  useEffect(() => {
    list.current?.children[index]?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (!picker) return null;
  const close = () => {
    set({ picker: null });
    focusEditor();
  };
  const choose = (position: number) => {
    const item = shown[position];
    if (!item) return;
    close();
    item.run();
  };

  return (
    <div className="scrim scrim-top" onMouseDown={close}>
      <div className="picker" role="dialog" aria-label={picker.placeholder} onMouseDown={(event) => event.stopPropagation()}>
        <input
          autoFocus
          value={query}
          placeholder={picker.placeholder}
          aria-label={picker.placeholder}
          spellCheck={false}
          onChange={(event) => {
            setQuery(event.target.value);
            setIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") (event.preventDefault(), setIndex((i) => Math.min(shown.length - 1, i + 1)));
            else if (event.key === "ArrowUp") (event.preventDefault(), setIndex((i) => Math.max(0, i - 1)));
            else if (event.key === "Enter") (event.preventDefault(), choose(index));
            else if (event.key === "Escape") close();
          }}
        />
        <ul ref={list} role="listbox">
          {shown.map((item, position) => (
            <li key={`${item.label}-${position}`} role="option" aria-selected={position === index}>
              <button type="button" className={position === index ? "is-on" : ""} onMouseEnter={() => setIndex(position)} onClick={() => choose(position)}>
                <span>{item.label}</span>
                {item.hint ? <kbd>{item.hint.replace("Arrow", "")}</kbd> : null}
              </button>
            </li>
          ))}
          {shown.length === 0 ? <li className="empty">Nothing matches "{query}".</li> : null}
        </ul>
      </div>
    </div>
  );
}

export function AskDialog() {
  const question = useStore((s) => s.ask);
  const [value, setValue] = useState("");

  useEffect(() => {
    setValue(question?.input ?? "");
  }, [question]);

  if (!question) return null;
  const answer = (button: string) => question.resolve({ button, input: value });
  const primary = question.buttons.find((button) => button.primary) ?? question.buttons[0];

  return (
    <div className="scrim" onMouseDown={() => answer("")}>
      <div
        className="ask"
        role="alertdialog"
        aria-labelledby="ask-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") answer("");
          if (event.key === "Enter" && question.input !== undefined) (event.preventDefault(), answer(primary.value));
        }}
      >
        <h2 id="ask-title">{question.title}</h2>
        {question.message ? <p>{question.message}</p> : null}
        {question.input !== undefined ? (
          <input autoFocus value={value} spellCheck={false} aria-label={question.title} onFocus={(event) => event.target.select()} onChange={(event) => setValue(event.target.value)} />
        ) : null}
        <div className="ask-buttons">
          {question.buttons.map((button) => (
            <button
              key={button.value}
              type="button"
              autoFocus={question.input === undefined && button === primary}
              className={`btn${button.primary ? " btn-go" : ""}`}
              onClick={() => answer(button.value)}
            >
              {button.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Toast() {
  const message = useStore((s) => s.toast);
  return (
    <div className="toast-zone" role="status" aria-live="polite">
      {message ? <p className="toast">{message}</p> : null}
    </div>
  );
}

function Toggle({ name, label, hint }: { name: keyof Settings; label: string; hint?: string }) {
  const value = useStore((s) => s.settings[name]) as boolean;
  return (
    <label className="pref">
      <span>
        <strong>{label}</strong>
        {hint ? <small>{hint}</small> : null}
      </span>
      <input
        type="checkbox"
        className="switch"
        role="switch"
        checked={value}
        onChange={(event) => {
          setSetting(name, event.target.checked as never);
          applySettings();
        }}
      />
    </label>
  );
}

function Preferences() {
  const settings = useStore((s) => s.settings);
  const number = (name: "fontSize" | "tabSize", min: number, max: number) => (
    <input
      type="number"
      min={min}
      max={max}
      value={settings[name]}
      onChange={(event) => {
        const value = Math.max(min, Math.min(max, Number(event.target.value) || min));
        setSetting(name, value);
        applySettings();
        getView()?.requestMeasure();
      }}
    />
  );

  return (
    <>
      <h3>Look</h3>
      <div className="theme-row" role="radiogroup" aria-label="Theme">
        {stations.map((theme) => (
          <button
            key={theme.id}
            type="button"
            role="radio"
            aria-checked={settings.theme === theme.id}
            className={`theme-card theme-${theme.id}${settings.theme === theme.id ? " is-on" : ""}`}
            onClick={() => setSetting("theme", theme.id)}
          >
            <span className="theme-swatch" />
            <strong>{theme.name}</strong>
            <small>{theme.frequency.toFixed(1)} on the dial</small>
          </button>
        ))}
      </div>
      <div className="pref-stack">
        <span>
          <strong>Interface size</strong>
          <small>Fit picks a size from the window's width. Right now that is {Math.round(sizeForWindow() * 100)}%.</small>
        </span>
        <div className="seg seg-fill" role="radiogroup" aria-label="Interface size">
          <button type="button" role="radio" aria-checked={settings.uiSize === null} className={settings.uiSize === null ? "is-on" : ""} onClick={() => setSetting("uiSize", null)}>
            Fit
          </button>
          {sizes.map((size) => (
            <button key={size} type="button" role="radio" aria-checked={settings.uiSize === size} className={settings.uiSize === size ? "is-on" : ""} onClick={() => setSetting("uiSize", size)}>
              {Math.round(size * 100)}%
            </button>
          ))}
        </div>
      </div>
      <label className="pref">
        <span>
          <strong>Text size</strong>
          <small>Ctrl with plus and minus also zooms</small>
        </span>
        {number("fontSize", 8, 40)}
      </label>
      <div className="pref">
        <span>
          <strong>Neon glow</strong>
          <small>Full also lights up the code itself</small>
        </span>
        <div className="seg seg-small" role="radiogroup" aria-label="Neon glow">
          {(["off", "soft", "full"] as const).map((level) => (
            <button key={level} type="button" role="radio" aria-checked={settings.glow === level} className={settings.glow === level ? "is-on" : ""} onClick={() => setSetting("glow", level)}>
              {level === "off" ? "Off" : level === "soft" ? "Soft" : "Full"}
            </button>
          ))}
        </div>
      </div>
      <Toggle name="backgroundArt" label="Sunset in the corner" hint="A faint drawing behind the text" />
      <Toggle name="toolbar" label="Toolbar" hint="The row of icons beside the menu" />
      <Toggle name="startScreen" label="Start screen" hint="Shown while the only tab is empty" />
      <Toggle name="lineNumbers" label="Line numbers" />
      <Toggle name="highlightLine" label="Highlight the current line" />
      <Toggle name="indentGuides" label="Indent guides" />
      <Toggle name="showWhitespace" label="Show spaces and tabs" />
      <Toggle name="minimap" label="Document map" hint="A small overview of the file on the right" />

      <h3>Editing</h3>
      <label className="pref">
        <span>
          <strong>Tab width</strong>
          <small>Columns per indent step</small>
        </span>
        {number("tabSize", 1, 16)}
      </label>
      <Toggle name="insertSpaces" label="Indent with spaces" hint="Off uses tab characters" />
      <Toggle name="wordWrap" label="Word wrap" />
      <Toggle name="autoComplete" label="Suggest completions while typing" />
      <Toggle name="autoClose" label="Close brackets and quotes" />

      <h3>Saving</h3>
      <Toggle name="saveOnBlur" label="Save when the window loses focus" hint="Only files that already have a place on disk" />

      <h3>Start-up</h3>
      <Toggle name="restoreSession" label="Reopen tabs from last time" hint="Unsaved text is kept too, so closing the app never asks" />
      <label className="pref-stack">
        <span>
          <strong>Web search address</strong>
          <small>The selected text is added to the end</small>
        </span>
        <input type="text" value={settings.searchEngine} spellCheck={false} onChange={(event) => setSetting("searchEngine", event.target.value)} />
      </label>
      <button
        type="button"
        className="btn sheet-last"
        onClick={() => {
          set({ settings: defaultSettings });
          applySettings();
        }}
      >
        Reset every preference
      </button>
    </>
  );
}

const algorithms = [
  { id: "md5", label: "MD5" },
  { id: "sha1", label: "SHA-1" },
  { id: "sha256", label: "SHA-256" },
  { id: "sha512", label: "SHA-512" },
];

function Hashes() {
  const [algorithm, setAlgorithm] = useState("sha256");
  const [text, setText] = useState(() => selectedText());
  const [perLine, setPerLine] = useState(false);
  const [output, setOutput] = useState("");

  useEffect(() => {
    let live = true;
    const parts = perLine ? text.split("\n").filter((line) => line !== "") : [text];
    Promise.all(parts.map((part) => platform.hashText(algorithm, part)))
      .then((hashes) => live && setOutput(text ? hashes.join("\n") : ""))
      .catch((error: unknown) => live && setOutput(String(error)));
    return () => {
      live = false;
    };
  }, [algorithm, text, perLine]);

  const hashFiles = async () => {
    const paths = await platform.pickFiles();
    if (!paths.length) return;
    const results = await platform.hashFiles(algorithm, paths);
    setOutput(results.map((result) => `${result.hash ?? result.error}  ${result.path}`).join("\n"));
  };

  return (
    <>
      <div className="seg" role="radiogroup" aria-label="Hash">
        {algorithms.map((entry) => (
          <button key={entry.id} type="button" role="radio" aria-checked={algorithm === entry.id} className={algorithm === entry.id ? "is-on" : ""} onClick={() => setAlgorithm(entry.id)}>
            {entry.label}
          </button>
        ))}
      </div>
      <label className="pref-stack">
        <strong>Text to hash</strong>
        <textarea rows={6} value={text} spellCheck={false} placeholder="Type or paste text. It starts with your selection." onChange={(event) => setText(event.target.value)} />
      </label>
      <label className="check">
        <input type="checkbox" checked={perLine} onChange={(event) => setPerLine(event.target.checked)} />
        <span>Hash each line on its own</span>
      </label>
      <label className="pref-stack">
        <strong>Result</strong>
        <textarea rows={5} value={output} readOnly spellCheck={false} placeholder="The hash appears here" />
      </label>
      <div className="btn-row">
        <button type="button" className="btn btn-go" disabled={!output} onClick={() => navigator.clipboard.writeText(output).then(() => toast("Hash copied"))}>
          Copy result
        </button>
        <button type="button" className="btn" onClick={() => void hashFiles()}>
          Hash files…
        </button>
      </div>
    </>
  );
}

function SummarySheet() {
  const doc = activeDoc();
  const cursor = useStore((s) => s.cursor);
  const whole = summarize(doc ? (snapshot(doc.id)?.text ?? "") : "");
  const picked = selectedText();
  const selection = picked ? summarize(picked) : null;
  const rows: [string, number, number | undefined][] = [
    ["Characters", whole.characters, selection?.characters],
    ["Characters without blanks", whole.charactersNoBlanks, selection?.charactersNoBlanks],
    ["Words", whole.words, selection?.words],
    ["Lines", whole.lines, selection?.lines],
    ["Bytes as UTF-8", whole.bytesUtf8, selection?.bytesUtf8],
  ];
  return (
    <>
      <dl className="facts">
        <dt>Name</dt>
        <dd>{doc?.name}</dd>
        <dt>Location</dt>
        <dd>{doc?.path ?? "Not saved yet"}</dd>
        <dt>Language</dt>
        <dd>{doc?.lang}</dd>
        <dt>Cursor</dt>
        <dd>
          Line {cursor.line}, column {cursor.col}
        </dd>
      </dl>
      <table className="counts">
        <thead>
          <tr>
            <th scope="col">Count</th>
            <th scope="col">File</th>
            <th scope="col">Selection</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, file, part]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{file.toLocaleString()}</td>
              <td>{part === undefined ? "none" : part.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function ColumnEditor() {
  const [mode, setMode] = useState<"text" | "number">("text");
  const [text, setText] = useState("");
  const [start, setStart] = useState(1);
  const [step, setStep] = useState(1);
  const [repeat, setRepeat] = useState(1);
  const [base, setBase] = useState<10 | 16 | 8 | 2>(10);
  const [leadingZeros, setLeadingZeros] = useState(false);

  const apply = () => {
    const total = columnInsert((count) =>
      mode === "text" ? Array.from({ length: count }, () => text) : numberColumn(count, { start, step, repeat, base, leadingZeros }),
    );
    toast(`Inserted on ${total} ${total === 1 ? "line" : "lines"}`);
    set({ sheet: null });
    focusEditor();
  };

  const field = (label: string, value: number, change: (value: number) => void) => (
    <label className="pref">
      <strong>{label}</strong>
      <input type="number" value={value} onChange={(event) => change(Number(event.target.value) || 0)} />
    </label>
  );

  return (
    <>
      <p className="sheet-lead">
        Inserts one value on each line. Select several lines first, or place several cursors with Ctrl and click. Alt and drag selects a column.
      </p>
      <div className="seg" role="radiogroup" aria-label="What to insert">
        <button type="button" role="radio" aria-checked={mode === "text"} className={mode === "text" ? "is-on" : ""} onClick={() => setMode("text")}>
          Text
        </button>
        <button type="button" role="radio" aria-checked={mode === "number"} className={mode === "number" ? "is-on" : ""} onClick={() => setMode("number")}>
          Numbers
        </button>
      </div>
      {mode === "text" ? (
        <label className="pref-stack">
          <strong>Text to insert</strong>
          <input type="text" autoFocus value={text} spellCheck={false} onChange={(event) => setText(event.target.value)} />
        </label>
      ) : (
        <>
          {field("First number", start, setStart)}
          {field("Increase by", step, setStep)}
          {field("Repeat each", repeat, setRepeat)}
          <div className="seg" role="radiogroup" aria-label="Number format">
            {([10, 16, 8, 2] as const).map((option) => (
              <button key={option} type="button" role="radio" aria-checked={base === option} className={base === option ? "is-on" : ""} onClick={() => setBase(option)}>
                {option === 10 ? "Decimal" : option === 16 ? "Hex" : option === 8 ? "Octal" : "Binary"}
              </button>
            ))}
          </div>
          <label className="check">
            <input type="checkbox" checked={leadingZeros} onChange={(event) => setLeadingZeros(event.target.checked)} />
            <span>Pad with leading zeros</span>
          </label>
        </>
      )}
      <button type="button" className="btn btn-go" onClick={apply}>
        Insert
      </button>
    </>
  );
}

function Shortcuts() {
  const [filter, setFilter] = useState("");
  const rows = allCommands().filter((entry) => entry.keys && entry.title.toLowerCase().includes(filter.toLowerCase()));
  return (
    <>
      <input className="side-filter" value={filter} placeholder="Filter commands" aria-label="Filter commands" onChange={(event) => setFilter(event.target.value)} />
      <table className="keys">
        <tbody>
          {rows.map((entry) => (
            <tr key={entry.id}>
              <th scope="row">{entry.title}</th>
              <td>
                <kbd>{entry.keys?.replace("Arrow", "")}</kbd>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="sheet-lead">Ctrl and click adds a cursor. Alt and drag selects a column. The Insert key switches between inserting and overwriting.</p>
    </>
  );
}

function About() {
  return (
    <div className="about">
      <Postcard className="about-art" label="A striped sun setting behind a city skyline and palm trees" />
      <p className="wordmark">Anonymous Notepad</p>
      <p className="about-version">Version {__APP_VERSION__}</p>
      <p>
        A text and code editor with tabs that come back after a restart, search across files, line tools and syntax colours for more than a hundred
        languages.
      </p>
      <p>The file work runs in Rust. The editor is built on CodeMirror 6. Made by El Diablo 59 and released under the MIT licence.</p>
      <p className="about-small">
        A fan-made project. It is not affiliated with, endorsed by or connected to Rockstar Games or Take-Two Interactive, and it contains none of
        their artwork, fonts or code. The licences of the packages it is built on are in the file third-party notices.txt in the install folder.
      </p>
    </div>
  );
}

const sheets: Record<SheetName, { title: string; body: () => React.ReactNode }> = {
  preferences: { title: "Preferences", body: () => <Preferences /> },
  hash: { title: "Hashes", body: () => <Hashes /> },
  summary: { title: "Summary", body: () => <SummarySheet /> },
  column: { title: "Column editor", body: () => <ColumnEditor /> },
  shortcuts: { title: "Keyboard shortcuts", body: () => <Shortcuts /> },
  about: { title: "About", body: () => <About /> },
};

export function Sheet() {
  const name = useStore((s) => s.sheet);
  if (!name) return null;
  const sheet = sheets[name];
  const close = () => {
    set({ sheet: null });
    focusEditor();
  };
  return (
    <aside
      className="sheet"
      role="dialog"
      aria-label={sheet.title}
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
    >
      <header className="sheet-head">
        <Logo size={20} />
        <h2>{sheet.title}</h2>
        <button type="button" className="icon-btn" aria-label={`Close ${sheet.title}`} onClick={close}>
          <X size={16} weight="bold" />
        </button>
      </header>
      <div className={`sheet-body sheet-${name}`}>{sheet.body()}</div>
    </aside>
  );
}
