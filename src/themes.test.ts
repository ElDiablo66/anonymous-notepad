import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { neighbour, stations } from "./themes";

const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`No block for ${selector}`);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  const values: Record<string, string> = {};
  for (const match of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) values[match[1]] = match[2].trim();
  return values;
}

const base = block(":root");

function palette(id: string): Record<string, string> {
  return id === "vice-night" ? base : { ...base, ...block(`:root[data-theme="${id}"]`) };
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => {
    const channel = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

// WCAG AA asks for 4.5:1 on body text.
const onEditor = [
  "--ed-text",
  "--syn-keyword",
  "--syn-string",
  "--syn-number",
  "--syn-comment",
  "--syn-function",
  "--syn-type",
  "--syn-tag",
  "--syn-property",
  "--syn-punctuation",
  "--syn-constant",
  "--syn-escape",
  "--syn-invalid",
];

describe("themes", () => {
  it("has a stylesheet block for every station", () => {
    for (const station of stations) expect(Object.keys(palette(station.id)).length).toBeGreaterThan(20);
  });

  for (const station of stations) {
    it(`${station.name}: code colours reach 4.5:1 on the editor background`, () => {
      const colours = palette(station.id);
      for (const name of onEditor) {
        const ratio = contrast(colours[name], colours["--ed-bg"]);
        expect(ratio, `${name} ${colours[name]} on ${colours["--ed-bg"]}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`${station.name}: interface text reaches 4.5:1 on panels`, () => {
      const colours = palette(station.id);
      for (const background of ["--panel", "--dusk-deep", "--solid"]) {
        for (const text of ["--text", "--text-soft"]) {
          const ratio = contrast(colours[text], colours[background]);
          expect(ratio, `${text} on ${background}`).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(contrast(colours["--accent"], colours["--panel"]), "accent on panel").toBeGreaterThanOrEqual(4.5);
    });
  }

  it("keeps the dial in order and wraps at the ends", () => {
    const frequencies = stations.map((station) => station.frequency);
    expect([...frequencies].sort((a, b) => a - b)).toEqual(frequencies);
    expect(neighbour("neon-noir", 1).id).toBe("flamingo-morning");
    expect(neighbour("flamingo-morning", -1).id).toBe("neon-noir");
  });
});
