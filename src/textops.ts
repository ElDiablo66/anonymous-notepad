// Pure text transformations. Line tools take and return arrays of lines.

export type LineOp = (lines: string[]) => string[];

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function leadingNumber(line: string, decimal: "." | ","): number {
  const cleaned = decimal === "," ? line.replace(/\./g, "").replace(",", ".") : line.replace(/,/g, "");
  const match = cleaned.match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : Number.NaN;
}

/** Lines without a number keep their order and go last. */
function sortNumeric(lines: string[], read: (line: string) => number, descending: boolean): string[] {
  const keyed = lines.map((line, index) => ({ line, index, key: read(line) }));
  keyed.sort((a, b) => {
    const aBad = Number.isNaN(a.key);
    const bBad = Number.isNaN(b.key);
    if (aBad || bBad) return aBad === bBad ? a.index - b.index : aBad ? 1 : -1;
    const order = descending ? b.key - a.key : a.key - b.key;
    return order || a.index - b.index;
  });
  return keyed.map((entry) => entry.line);
}

const collator = new Intl.Collator(undefined, { numeric: false, sensitivity: "variant" });

export const lineOps: Record<string, LineOp> = {
  sortAsc: (lines) => [...lines].sort(compareText),
  sortDesc: (lines) => [...lines].sort((a, b) => compareText(b, a)),
  sortAscNoCase: (lines) => [...lines].sort((a, b) => compareText(a.toLowerCase(), b.toLowerCase())),
  sortDescNoCase: (lines) => [...lines].sort((a, b) => compareText(b.toLowerCase(), a.toLowerCase())),
  sortLocaleAsc: (lines) => [...lines].sort(collator.compare),
  sortLocaleDesc: (lines) => [...lines].sort((a, b) => collator.compare(b, a)),
  sortLengthAsc: (lines) => [...lines].sort((a, b) => a.length - b.length),
  sortLengthDesc: (lines) => [...lines].sort((a, b) => b.length - a.length),
  sortIntAsc: (lines) => sortNumeric(lines, (l) => Number.parseInt(l.trim(), 10), false),
  sortIntDesc: (lines) => sortNumeric(lines, (l) => Number.parseInt(l.trim(), 10), true),
  sortDotAsc: (lines) => sortNumeric(lines, (l) => leadingNumber(l, "."), false),
  sortDotDesc: (lines) => sortNumeric(lines, (l) => leadingNumber(l, "."), true),
  sortCommaAsc: (lines) => sortNumeric(lines, (l) => leadingNumber(l, ","), false),
  sortCommaDesc: (lines) => sortNumeric(lines, (l) => leadingNumber(l, ","), true),
  reverse: (lines) => [...lines].reverse(),
  shuffle: (lines) => {
    const out = [...lines];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  },
  removeDuplicates: (lines) => {
    const seen = new Set<string>();
    return lines.filter((line) => (seen.has(line) ? false : (seen.add(line), true)));
  },
  removeConsecutiveDuplicates: (lines) => lines.filter((line, i) => i === 0 || line !== lines[i - 1]),
  removeEmpty: (lines) => lines.filter((line) => line !== ""),
  removeBlank: (lines) => lines.filter((line) => line.trim() !== ""),
  trimTrailing: (lines) => lines.map((line) => line.replace(/[ \t]+$/, "")),
  trimLeading: (lines) => lines.map((line) => line.replace(/^[ \t]+/, "")),
  trimBoth: (lines) => lines.map((line) => line.replace(/^[ \t]+|[ \t]+$/g, "")),
  join: (lines) => [lines.join(" ")],
  eolToSpace: (lines) => [lines.join(" ")],
  trimAndJoin: (lines) => [lines.map((line) => line.trim()).join(" ")],
};

export function tabsToSpaces(lines: string[], tabSize: number): string[] {
  return lines.map((line) => {
    let out = "";
    for (const char of line) {
      if (char === "\t") out += " ".repeat(tabSize - (out.length % tabSize));
      else out += char;
    }
    return out;
  });
}

/** Turns runs of spaces that end on a tab stop into tabs. `leadingOnly` stops at the first other character. */
export function spacesToTabs(lines: string[], tabSize: number, leadingOnly: boolean): string[] {
  return lines.map((line) => {
    let out = "";
    let column = 0;
    let pending = 0;
    let inLead = true;
    for (const char of line) {
      if (char === " " && (inLead || !leadingOnly)) {
        pending += 1;
        column += 1;
        if (column % tabSize === 0) {
          out += pending > 1 || inLead ? "\t" : " ";
          pending = 0;
        }
        continue;
      }
      out += " ".repeat(pending);
      pending = 0;
      if (char === "\t") {
        column += tabSize - (column % tabSize);
      } else {
        column += 1;
        inLead = false;
      }
      out += char;
    }
    return out + " ".repeat(pending);
  });
}

/** Breaks lines longer than `width` at spaces. */
export function splitLines(lines: string[], width: number): string[] {
  const out: string[] = [];
  for (const line of lines) {
    let rest = line;
    while (rest.length > width) {
      let cut = rest.lastIndexOf(" ", width);
      if (cut <= 0) cut = rest.indexOf(" ", width);
      if (cut <= 0) break;
      out.push(rest.slice(0, cut));
      rest = rest.slice(cut + 1);
    }
    out.push(rest);
  }
  return out;
}

export type CaseOp = (text: string) => string;

const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;

export const caseOps: Record<string, CaseOp> = {
  upper: (text) => text.toUpperCase(),
  lower: (text) => text.toLowerCase(),
  proper: (text) => text.replace(WORD, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase()),
  properBlend: (text) => text.replace(WORD, (word) => word[0].toUpperCase() + word.slice(1)),
  sentence: (text) =>
    text.toLowerCase().replace(/(^|[.!?]\s+|\n\s*)(\p{L})/gu, (_, lead: string, letter: string) => lead + letter.toUpperCase()),
  sentenceBlend: (text) =>
    text.replace(/(^|[.!?]\s+|\n\s*)(\p{L})/gu, (_, lead: string, letter: string) => lead + letter.toUpperCase()),
  invert: (text) =>
    [...text].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join(""),
  random: (text) => [...text].map((c) => (Math.random() < 0.5 ? c.toLowerCase() : c.toUpperCase())).join(""),
};

export interface NumberColumn {
  start: number;
  step: number;
  repeat: number;
  base: 10 | 16 | 8 | 2;
  leadingZeros: boolean;
}

/** The values a number column puts on `count` lines. */
export function numberColumn(count: number, options: NumberColumn): string[] {
  const values: string[] = [];
  const repeat = Math.max(1, options.repeat);
  for (let i = 0; i < count; i += 1) {
    const value = options.start + Math.floor(i / repeat) * options.step;
    const digits = Math.abs(value).toString(options.base).toUpperCase();
    values.push((value < 0 ? "-" : "") + digits);
  }
  if (options.leadingZeros) {
    const width = Math.max(...values.map((v) => v.replace("-", "").length));
    return values.map((v) => (v.startsWith("-") ? "-" + v.slice(1).padStart(width, "0") : v.padStart(width, "0")));
  }
  return values;
}

export interface Summary {
  characters: number;
  charactersNoBlanks: number;
  words: number;
  lines: number;
  bytesUtf8: number;
}

export function summarize(text: string): Summary {
  return {
    characters: [...text.replace(/\n/g, "")].length,
    charactersNoBlanks: [...text.replace(/\s/g, "")].length,
    words: text.match(/\S+/g)?.length ?? 0,
    lines: text === "" ? 1 : text.split("\n").length,
    bytesUtf8: new TextEncoder().encode(text).length,
  };
}

/** Expands \n, \r, \t, \0, \\, \xHH and \uHHHH, the "extended" search mode. */
export function unescapeExtended(input: string): string {
  return input.replace(/\\(x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|[nrt0\\])/g, (_, code: string) => {
    switch (code[0]) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      case "0":
        return "\0";
      case "\\":
        return "\\";
      default:
        return String.fromCodePoint(Number.parseInt(code.slice(1), 16));
    }
  });
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function dateTimeShort(now: Date): string {
  return `${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ${now.toLocaleDateString()}`;
}

export function dateTimeLong(now: Date): string {
  return `${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ${now.toLocaleDateString([], {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })}`;
}

export function dateTimeIso(now: Date): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

/** Re-indents JSON. Throws with the parser's message when the text is not valid JSON. */
export function formatJson(text: string, indent: string | number): string {
  return JSON.stringify(JSON.parse(text), null, indent);
}

export function minifyJson(text: string): string {
  return JSON.stringify(JSON.parse(text));
}

export function base64Encode(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Decodes Base64 holding UTF-8 text. Throws when the input is not Base64 or not text. */
export function base64Decode(text: string): string {
  const binary = atob(text.replace(/\s+/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
