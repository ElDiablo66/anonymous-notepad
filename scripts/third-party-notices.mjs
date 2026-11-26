// Collects the licence of every package that ends up in the app (npm and Rust)
// into one text file that ships with the installer.
//
//   node scripts/third-party-notices.mjs
//
// Identical licence texts are stored once and referenced by number.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "src-tauri", "resources", "third-party notices.txt");
const licenceFile = /^(licen[sc]e|copying|notice)/i;

const texts = new Map(); // hash -> { number, text }
const packages = [];

function remember(text) {
  const clean = text.replace(/\r\n?/g, "\n").trim();
  const hash = createHash("sha256").update(clean.replace(/\s+/g, " ")).digest("hex");
  if (!texts.has(hash)) texts.set(hash, { number: texts.size + 1, text: clean });
  return texts.get(hash).number;
}

function licenceTexts(folder) {
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((name) => licenceFile.test(name))
    .sort()
    .map((name) => remember(readFileSync(join(folder, name), "utf8")));
}

// npm: everything in the lock file that is not a development-only package.
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
for (const [path, entry] of Object.entries(lock.packages)) {
  if (!path || entry.dev || entry.devOptional) continue;
  const folder = join(root, path);
  const manifestPath = join(folder, "package.json");
  if (!existsSync(manifestPath)) continue;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  packages.push({
    source: "npm",
    name: manifest.name,
    version: manifest.version,
    licence: typeof manifest.license === "string" ? manifest.license : "see licence text",
    texts: licenceTexts(folder),
  });
}

// Rust: every crate in the dependency graph for 64-bit Windows.
const metadata = JSON.parse(
  execFileSync(
    "cargo",
    ["metadata", "--format-version", "1", "--manifest-path", join(root, "src-tauri", "Cargo.toml"), "--filter-platform", "x86_64-pc-windows-msvc"],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  ),
);
const own = new Set(metadata.workspace_members);
for (const crate of metadata.packages) {
  if (own.has(crate.id)) continue;
  packages.push({
    source: "crate",
    name: crate.name,
    version: crate.version,
    licence: crate.license ?? "see licence text",
    texts: licenceTexts(dirname(crate.manifest_path)),
  });
}

packages.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

const lines = [
  "Anonymous Notepad: third-party notices",
  "",
  "Anonymous Notepad is built on the open-source packages listed below.",
  "Each line gives the package, its version, the licence it declares and the",
  "numbers of its licence texts, which follow the list.",
  "",
  `Packages: ${packages.length}. Distinct licence texts: ${texts.size}.`,
  "",
  "PACKAGES",
  "",
];
for (const entry of packages) {
  const refs = entry.texts.length ? `texts ${[...new Set(entry.texts)].join(", ")}` : "no licence file in the package";
  lines.push(`${entry.name} ${entry.version} (${entry.source}) | ${entry.licence} | ${refs}`);
}
lines.push("", "LICENCE TEXTS", "");
for (const { number, text } of texts.values()) {
  lines.push(`===== Text ${number} =====`, "", text, "");
}

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, lines.join("\n"), "utf8");
console.log(`${packages.length} packages, ${texts.size} licence texts -> ${output}`);
