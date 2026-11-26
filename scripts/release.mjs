// Builds a signed installer and, when asked, publishes it as a GitHub release the app can update itself from.
//
//   node scripts/release.mjs build      signed build of the version in package.json
//   node scripts/release.mjs publish    release on GitHub with the installer and latest.json
//
// The signing key is read from ANONYMOUS_NOTEPAD_UPDATE_KEY (a path), or from
// "~/.tauri/anonymous-notepad update key". It never goes into the repository.
// The release notes are the version's section of CHANGELOG.md.

import { execFileSync, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "ElDiablo66/anonymous-notepad";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const step = process.argv[2];
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const bundle = join(root, "src-tauri", "target", "release", "bundle", "nsis");
const built = join(bundle, `Anonymous Notepad_${version}_x64-setup.exe`);
const out = join(root, "src-tauri", "target", "release", "publish", version);
const name = `Anonymous-Notepad-${version}-setup.exe`;

function changelogSection() {
  const text = readFileSync(join(root, "CHANGELOG.md"), "utf8").replace(/\r\n/g, "\n");
  const start = text.indexOf(`## ${version},`);
  if (start < 0) throw new Error(`CHANGELOG.md has no section for ${version}`);
  const body = text.slice(text.indexOf("\n", start) + 1);
  const end = body.search(/^## /m);
  return (end < 0 ? body : body.slice(0, end)).trim();
}

if (step === "build") {
  const keyPath = process.env.ANONYMOUS_NOTEPAD_UPDATE_KEY ?? join(homedir(), ".tauri", "anonymous-notepad update key");
  if (!existsSync(keyPath)) {
    console.error(`No signing key at ${keyPath}`);
    process.exit(1);
  }
  changelogSection();
  const env = { ...process.env, TAURI_SIGNING_PRIVATE_KEY: readFileSync(keyPath, "utf8").trim(), TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "" };
  execSync("npm run tauri build", { cwd: root, env, stdio: "inherit" });
  console.log(`Signed installer: ${built}`);
} else if (step === "publish") {
  const signature = `${built}.sig`;
  for (const needed of [built, signature]) {
    if (!existsSync(needed)) {
      console.error(`Not found: ${needed}\nRun "node scripts/release.mjs build" first.`);
      process.exit(1);
    }
  }
  if (statSync(signature).mtimeMs < statSync(built).mtimeMs - 60_000) {
    console.error("The signature is older than the installer. Build again.");
    process.exit(1);
  }
  const notes = changelogSection();
  mkdirSync(out, { recursive: true });
  copyFileSync(built, join(out, name));
  const digest = createHash("sha256").update(readFileSync(join(out, name))).digest("hex");
  const feed = {
    version,
    notes,
    pub_date: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    platforms: {
      "windows-x86_64": {
        signature: readFileSync(signature, "utf8").trim(),
        url: `https://github.com/${REPO}/releases/download/v${version}/${name}`,
      },
    },
  };
  writeFileSync(join(out, "latest.json"), `${JSON.stringify(feed, null, 2)}\n`);
  writeFileSync(
    join(out, "notes.md"),
    `${notes}\n\n## Install\n\nFrom 0.4.0 on the app updates itself. For a first install, or to move up from 0.3.x, download \`${name}\` below and run it over the old version; your tabs and preferences are kept. The installer is not code signed, so Windows SmartScreen warns the first time: choose "More info", then "Run anyway".\n\nSHA-256 of the installer:\n\n\`\`\`\n${digest}\n\`\`\`\n`,
  );
  execFileSync(
    "gh",
    ["release", "create", `v${version}`, join(out, name), join(out, "latest.json"), "--repo", REPO, "--target", "main", "--title", `Anonymous Notepad ${version}`, "--notes-file", join(out, "notes.md")],
    { stdio: "inherit" },
  );
  console.log(`Published v${version}, SHA-256 ${digest}`);
} else {
  console.error('Use "node scripts/release.mjs build" or "node scripts/release.mjs publish"');
  process.exit(1);
}
