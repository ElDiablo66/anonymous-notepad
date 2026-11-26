// The themes are presented as radio stations: each has a place on the dial.

export type ThemeId = "flamingo-morning" | "golden-hour" | "vice-night" | "ocean-drive" | "everglades" | "neon-noir";

export interface Station {
  id: ThemeId;
  name: string;
  /** Position on the dial, in MHz between 87 and 108. */
  frequency: number;
  note: string;
  light?: boolean;
}

export const DIAL_START = 87;
export const DIAL_END = 108;

export const stations: Station[] = [
  { id: "flamingo-morning", name: "Flamingo morning", frequency: 88.1, note: "Light theme. Cream paper, flamingo pink", light: true },
  { id: "golden-hour", name: "Golden hour", frequency: 92.7, note: "Warm plum, orange sun" },
  { id: "vice-night", name: "Vice night", frequency: 96.3, note: "Violet dusk, pink neon" },
  { id: "ocean-drive", name: "Ocean drive", frequency: 99.9, note: "Deep sea blue, teal neon" },
  { id: "everglades", name: "Everglades", frequency: 103.5, note: "Swamp green, mint and coral" },
  { id: "neon-noir", name: "Neon noir", frequency: 107.1, note: "High contrast. Near black, hot pink" },
];

export function stationFor(id: string): Station {
  return stations.find((station) => station.id === id) ?? stations[2];
}

/** The next station up or down the dial, wrapping at the ends. */
export function neighbour(id: string, step: 1 | -1): Station {
  const index = stations.findIndex((station) => station.id === id);
  return stations[(index + step + stations.length) % stations.length];
}
