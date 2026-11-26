import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sizeForWindow, sizes } from "./scale";

describe("interface size", () => {
  it("grows with the window", () => {
    expect(sizeForWindow(1280)).toBe(1);
    expect(sizeForWindow(1999)).toBe(1);
    expect(sizeForWindow(2000)).toBe(1.15);
    expect(sizeForWindow(2560)).toBe(1.3);
    expect(sizeForWindow(3840)).toBe(1.5);
    expect(sizeForWindow(5120)).toBe(2);
  });

  it("only fits to sizes that can also be picked by hand", () => {
    for (const width of [800, 2000, 2500, 3400, 4400]) expect(sizes).toContain(sizeForWindow(width));
  });
});

describe("page shell", () => {
  // An inline style block makes the desktop shell add a nonce to the style policy,
  // and a nonce switches off the allowance the editor needs for the styles it injects.
  // Version 0.2.0 shipped with one and the editor came up unstyled.
  it("has no inline style block or style attribute", () => {
    const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
    expect(html).not.toMatch(/<style[\s>]/i);
    expect(html).not.toMatch(/\sstyle=/i);
  });

  it("keeps the desktop shell from rewriting the style policy", () => {
    const config = JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
    expect(config.app.security.dangerousDisableAssetCspModification).toContain("style-src");
    expect(config.app.security.csp).toContain("style-src 'self' 'unsafe-inline'");
  });
});
