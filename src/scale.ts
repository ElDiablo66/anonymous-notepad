// Interface size. "Fit the window" picks a size from the window's width, so the
// menus and panels do not look lost on a very wide screen.

export const sizes = [1, 1.15, 1.3, 1.5, 1.75, 2];

/** The size "Fit the window" uses for a window this many CSS pixels wide. */
export function sizeForWindow(width: number = window.innerWidth): number {
  if (width >= 4400) return 2;
  if (width >= 3400) return 1.5;
  if (width >= 2500) return 1.3;
  if (width >= 2000) return 1.15;
  return 1;
}

let current = 1;

/** The size in use right now. Menus need it to turn screen positions into their own units. */
export function uiScale(): number {
  return current;
}

export function setUiScale(size: number): void {
  current = size;
  document.documentElement.style.setProperty("--ui", String(size));
}
