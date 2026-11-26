// Writes one version number into the three files that carry it.
//
//   node scripts/set-version.mjs 0.2.1

import { execFileSync, execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Give a version such as 0.2.1");
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function edit(path, change) {
  const file = join(root, path);
  writeFileSync(file, change(readFileSync(file, "utf8")), "utf8");
}

edit("package.json", (text) => text.replace(/"version": "[^"]+"/, `"version": "${version}"`));
edit("src-tauri/tauri.conf.json", (text) => text.replace(/"version": "[^"]+"/, `"version": "${version}"`));
edit("src-tauri/Cargo.toml", (text) => text.replace(/^version = "[^"]+"/m, `version = "${version}"`));

// The lock files repeat the number.
execSync("npm install --package-lock-only --silent", { cwd: root, stdio: "inherit" });
execFileSync("cargo", ["update", "--offline", "--package", "anonymous-notepad", "--manifest-path", join(root, "src-tauri", "Cargo.toml")], {
  cwd: root,
  stdio: "inherit",
});
console.log(`Version set to ${version}`);
