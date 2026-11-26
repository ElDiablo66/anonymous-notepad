// Looking for a newer version on GitHub and installing it.

import * as files from "./files";
import * as platform from "./platform";
import { get, set, toast } from "./store";

const SIX_HOURS = 6 * 60 * 60 * 1000;

/** Asks GitHub for a newer version. Returns it, or null when this is the newest. Throws on a network problem. */
export async function lookForUpdate(): Promise<platform.FoundUpdate | null> {
  const found = await platform.updateCheck();
  set({ update: found ? { ...found, busy: false } : null });
  return found;
}

/** Saves the session, then downloads and runs the installer. The app closes and opens again as the new version. */
export async function installUpdate(): Promise<void> {
  const update = get().update;
  if (!update || update.busy) return;
  set({ update: { ...update, busy: true } });
  toast(`Getting version ${update.version}. The app closes and opens again by itself.`);
  try {
    // Unsaved tabs live in the session file, so nothing typed is lost across the restart.
    await files.saveSession();
    await platform.updateInstall();
  } catch (error) {
    set({ update: { ...update, busy: false } });
    toast(`The update did not install: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Looks once at start-up and then every six hours. With "auto", an update found at start-up
 * is installed straight away, before any typing starts; one found later waits for a click.
 */
export function watchForUpdates(): () => void {
  if (!platform.desktop) return () => undefined;
  const look = async (atStart: boolean) => {
    const choice = get().settings.updates;
    if (choice === "off") return;
    try {
      const found = await lookForUpdate();
      if (found && atStart && choice === "auto") await installUpdate();
    } catch {
      // No network, or no release with an update file yet: try again next time, quietly.
    }
  };
  const first = setTimeout(() => void look(true), 3000);
  const later = setInterval(() => void look(false), SIX_HOURS);
  return () => {
    clearTimeout(first);
    clearInterval(later);
  };
}
