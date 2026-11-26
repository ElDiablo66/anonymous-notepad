// Sample content for looking at the interface in a plain browser:
// open the dev server with ?demo and optional &theme=, &glow=, &panel=, &side=, &size=.
// The desktop app never runs this.

import { addDoc, newDoc, openBig } from "./files";
import { desktop } from "./platform";
import { lastFind } from "./search";
import { get, set, type SheetName, type SidePanel } from "./store";
import { stations, type ThemeId } from "./themes";

const params = new URLSearchParams(window.location.search);

export const demo = !desktop && params.has("demo");
export const demoPanel = demo ? params.get("panel") : null;

const radio = `use std::collections::BTreeMap;

/// One stop on the dial.
#[derive(Debug, Clone)]
pub struct Station {
    pub name: &'static str,
    pub frequency: f32,
    pub playing: bool,
}

pub struct Dial {
    stations: BTreeMap<u32, Station>,
    tuned: Option<u32>,
}

impl Dial {
    pub fn new() -> Self {
        Self { stations: BTreeMap::new(), tuned: None }
    }

    // Frequencies are stored in tenths of a megahertz so they sort exactly.
    pub fn add(&mut self, name: &'static str, frequency: f32) {
        let key = (frequency * 10.0).round() as u32;
        self.stations.insert(key, Station { name, frequency, playing: false });
    }

    pub fn tune(&mut self, frequency: f32) -> Option<&Station> {
        let key = (frequency * 10.0).round() as u32;
        if let Some(previous) = self.tuned.and_then(|k| self.stations.get_mut(&k)) {
            previous.playing = false;
        }
        let station = self.stations.get_mut(&key)?;
        station.playing = true;
        self.tuned = Some(key);
        Some(station)
    }
}

fn main() {
    let mut dial = Dial::new();
    dial.add("Vice night", 96.3);
    dial.add("Ocean drive", 99.9);
    match dial.tune(96.3) {
        Some(station) => println!("Now playing {} on {:.1}", station.name, station.frequency),
        None => eprintln!("Static."),
    }
}
`;

const notes = `# Night drive

Things to pack before the coast road:

- [x] Cassette adapter
- [ ] Sunglasses, the mirrored pair
- [ ] Cash for the toll bridge

## Route

1. Leave at **6:40 pm**, before the sun drops behind the towers.
2. Take the causeway, not the tunnel.
3. Stop at the pier for \`cafecito\`.

> The palms look best with the windows down.
`;

const settings = `{
  "name": "night-drive",
  "version": "0.2.0",
  "stations": [
    { "name": "Vice night", "frequency": 96.3, "favourite": true },
    { "name": "Ocean drive", "frequency": 99.9, "favourite": false }
  ],
  "volume": 7,
  "headlights": null
}
`;

/** Fills the window with sample tabs and applies the look named in the address. */
export async function seedDemo(): Promise<void> {
  const theme = params.get("theme");
  const glow = params.get("glow");
  set({
    settings: {
      ...get().settings,
      theme: stations.some((station) => station.id === theme) ? (theme as ThemeId) : "vice-night",
      glow: glow === "off" || glow === "full" ? glow : "soft",
      minimap: params.has("map"),
      uiSize: Number(params.get("size")) || null,
    },
    recent: ["C:\\Projects\\night-drive\\src\\radio.rs", "C:\\Projects\\night-drive\\notes.md", "C:\\Projects\\night-drive\\settings.json"],
  });
  if (demoPanel === "start") {
    newDoc();
    return;
  }

  const first = await addDoc("radio.rs", radio, "Rust");
  await addDoc("notes.md", notes, "Markdown");
  await addDoc("settings.json", settings, "JSON");
  set({ activeId: first });
  if (demoPanel === "big") await openBig("C:\\Logs\\server.log");

  const side = params.get("side");
  if (side === "docs" || side === "functions" || side === "folder") set({ side: side as SidePanel });
  if (demoPanel === "find" || demoPanel === "replace") {
    lastFind.what = "station";
    set({ bottom: "find", findTab: demoPanel });
  }
  if (["preferences", "about", "shortcuts", "hash", "summary", "column"].includes(demoPanel ?? "")) set({ sheet: demoPanel as SheetName });
}
