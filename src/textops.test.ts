import { describe, expect, it } from "vitest";
import {
  base64Decode,
  base64Encode,
  caseOps,
  formatJson,
  lineOps,
  minifyJson,
  numberColumn,
  spacesToTabs,
  splitLines,
  summarize,
  tabsToSpaces,
  unescapeExtended,
} from "./textops";

describe("line tools", () => {
  it("sorts by text, ignoring case when asked", () => {
    expect(lineOps.sortAsc(["b", "A", "a"])).toEqual(["A", "a", "b"]);
    expect(lineOps.sortAscNoCase(["b", "A", "c"])).toEqual(["A", "b", "c"]);
    expect(lineOps.sortDesc(["a", "c", "b"])).toEqual(["c", "b", "a"]);
  });

  it("sorts numbers and leaves lines without one at the end", () => {
    expect(lineOps.sortIntAsc(["10", "9", "x", "-2"])).toEqual(["-2", "9", "10", "x"]);
    expect(lineOps.sortDotDesc(["1.5", "1.25", "10"])).toEqual(["10", "1.5", "1.25"]);
    expect(lineOps.sortCommaAsc(["2,5", "2,25", "1.000,1"])).toEqual(["2,25", "2,5", "1.000,1"]);
  });

  it("sorts by length", () => {
    expect(lineOps.sortLengthAsc(["ccc", "a", "bb"])).toEqual(["a", "bb", "ccc"]);
  });

  it("removes duplicates and empty lines", () => {
    expect(lineOps.removeDuplicates(["a", "b", "a", "c", "b"])).toEqual(["a", "b", "c"]);
    expect(lineOps.removeConsecutiveDuplicates(["a", "a", "b", "a"])).toEqual(["a", "b", "a"]);
    expect(lineOps.removeEmpty(["a", "", " ", "b"])).toEqual(["a", " ", "b"]);
    expect(lineOps.removeBlank(["a", "", " \t", "b"])).toEqual(["a", "b"]);
  });

  it("trims and joins", () => {
    expect(lineOps.trimTrailing(["a  ", " b\t"])).toEqual(["a", " b"]);
    expect(lineOps.trimBoth(["  a  "])).toEqual(["a"]);
    expect(lineOps.join(["a", "b"])).toEqual(["a b"]);
    expect(lineOps.trimAndJoin([" a ", " b "])).toEqual(["a b"]);
  });

  it("keeps every line when shuffling", () => {
    const lines = ["1", "2", "3", "4", "5"];
    expect(lineOps.shuffle(lines).sort()).toEqual(lines);
  });

  it("splits long lines at spaces", () => {
    expect(splitLines(["one two three four"], 9)).toEqual(["one two", "three", "four"]);
    expect(splitLines(["short"], 9)).toEqual(["short"]);
  });
});

describe("tabs and spaces", () => {
  it("expands tabs to the next stop", () => {
    expect(tabsToSpaces(["\ta", "ab\tc"], 4)).toEqual(["    a", "ab  c"]);
  });

  it("packs leading spaces into tabs", () => {
    expect(spacesToTabs(["        a  b"], 4, true)).toEqual(["\t\ta  b"]);
    expect(spacesToTabs(["      a"], 4, true)).toEqual(["\t  a"]);
  });
});

describe("case tools", () => {
  it("converts case", () => {
    expect(caseOps.upper("neon")).toBe("NEON");
    expect(caseOps.proper("oCEAN drive's END")).toBe("Ocean Drive's End");
    expect(caseOps.sentence("FIRST one. second ONE")).toBe("First one. Second one");
    expect(caseOps.invert("aBc")).toBe("AbC");
  });
});

describe("number column", () => {
  it("counts with a step and a repeat", () => {
    expect(numberColumn(4, { start: 1, step: 2, repeat: 1, base: 10, leadingZeros: false })).toEqual(["1", "3", "5", "7"]);
    expect(numberColumn(4, { start: 0, step: 1, repeat: 2, base: 10, leadingZeros: false })).toEqual(["0", "0", "1", "1"]);
  });

  it("pads and changes base", () => {
    expect(numberColumn(3, { start: 8, step: 1, repeat: 1, base: 10, leadingZeros: true })).toEqual(["08", "09", "10"]);
    expect(numberColumn(2, { start: 255, step: 1, repeat: 1, base: 16, leadingZeros: false })).toEqual(["FF", "100"]);
  });
});

describe("summary and escapes", () => {
  it("counts characters, words, lines and bytes", () => {
    expect(summarize("héllo wörld\nsecond line")).toEqual({
      characters: 22,
      charactersNoBlanks: 20,
      words: 4,
      lines: 2,
      bytesUtf8: 25,
    });
  });

  it("expands extended escapes", () => {
    expect(unescapeExtended("a\\tb\\n\\x41\\u00e9\\\\")).toBe("a\tb\nAé\\");
    expect(unescapeExtended("\\q")).toBe("\\q");
  });
});

describe("converters", () => {
  it("formats and minifies JSON", () => {
    expect(formatJson('{"a":[1,2],"b":null}', 2)).toBe('{\n  "a": [\n    1,\n    2\n  ],\n  "b": null\n}');
    expect(minifyJson('{ "a" : [ 1, 2 ] }')).toBe('{"a":[1,2]}');
    expect(() => formatJson("{oops}", 2)).toThrow();
  });

  it("round-trips Base64 with text outside ASCII", () => {
    expect(base64Encode("neon")).toBe("bmVvbg==");
    expect(base64Decode(base64Encode("café 日本 😀"))).toBe("café 日本 😀");
    expect(base64Decode("bmVv\nbg==")).toBe("neon");
    expect(() => base64Decode("not base64!")).toThrow();
  });
});
