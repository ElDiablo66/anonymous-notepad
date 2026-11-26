import { CaretRight, Check } from "@phosphor-icons/react";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { command, focusEditor, type MenuItem, menus } from "../commands";

interface Point {
  left: number;
  top: number;
}

interface ListProps {
  items: MenuItem[];
  /** Where the list wants to open. `flipLeft` is the edge to use when it does not fit to the right. */
  at: Point & { flipLeft?: number };
  close: () => void;
}

function resolve(items: MenuItem[] | (() => MenuItem[])): MenuItem[] {
  return typeof items === "function" ? items() : items;
}

function MenuList({ items, at, close }: ListProps) {
  const ref = useRef<HTMLUListElement>(null);
  const [place, setPlace] = useState<Point>(at);
  const [open, setOpen] = useState<{ index: number; at: Point & { flipLeft: number } } | null>(null);

  // Fixed positioning keeps nested lists from being clipped by a scrolling parent; this keeps them on screen.
  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    let left = at.left;
    let top = at.top;
    if (left + box.width > window.innerWidth - 4) left = Math.max(4, (at.flipLeft ?? window.innerWidth) - box.width);
    if (top + box.height > window.innerHeight - 4) top = Math.max(4, window.innerHeight - box.height - 4);
    setPlace({ left, top });
  }, [at.left, at.top, at.flipLeft]);

  const run = (action: () => void | Promise<void>) => {
    close();
    focusEditor();
    void action();
  };

  return (
    <ul ref={ref} className="menu-list" role="menu" style={{ left: place.left, top: place.top }}>
      {items.map((item, index) => {
        if (item === "-") return <li key={index} className="menu-rule" role="separator" />;
        if (typeof item === "string") {
          const entry = command(item);
          if (!entry) return null;
          return (
            <li key={index} role="none" onMouseEnter={() => setOpen(null)}>
              <button type="button" role="menuitem" className="menu-row" onClick={() => run(entry.run)}>
                <span className="menu-check">{entry.checked?.() ? <Check size={13} weight="bold" /> : null}</span>
                <span className="menu-label">{entry.title}</span>
                {entry.keys ? <kbd>{entry.keys.replace("Arrow", "")}</kbd> : null}
              </button>
            </li>
          );
        }
        if ("items" in item) {
          const isOpen = open?.index === index;
          return (
            <li
              key={index}
              role="none"
              onMouseEnter={(event) => {
                const box = event.currentTarget.getBoundingClientRect();
                setOpen({ index, at: { left: box.right - 2, top: box.top - 5, flipLeft: box.left + 2 } });
              }}
            >
              <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={isOpen} className={`menu-row${isOpen ? " is-open" : ""}`}>
                <span className="menu-check" />
                <span className="menu-label">{item.label}</span>
                <CaretRight size={12} weight="bold" />
              </button>
              {isOpen && open ? <MenuList items={resolve(item.items)} at={open.at} close={close} /> : null}
            </li>
          );
        }
        return (
          <li key={index} role="none" onMouseEnter={() => setOpen(null)}>
            <button type="button" role="menuitem" className="menu-row" onClick={() => run(item.run)}>
              <span className="menu-check">{item.checked ? <Check size={13} weight="bold" /> : null}</span>
              <span className="menu-label">{item.label}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function useDismiss(active: boolean, close: () => void, inside: React.RefObject<HTMLElement | null>): void {
  useEffect(() => {
    if (!active) return;
    const onDown = (event: MouseEvent) => {
      if (!inside.current?.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        focusEditor();
      }
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", close);
    };
  }, [active, close, inside]);
}

export function MenuBar() {
  const ref = useRef<HTMLElement>(null);
  const [open, setOpen] = useState<{ index: number; at: Point } | null>(null);
  const close = () => setOpen(null);
  useDismiss(open !== null, close, ref);

  const show = (index: number, button: HTMLElement) => {
    const box = button.getBoundingClientRect();
    setOpen({ index, at: { left: box.left, top: box.bottom + 2 } });
  };

  return (
    <nav ref={ref} className="menubar" aria-label="Main menu">
      {menus.map((menu, index) => (
        <div key={menu.label} className="menubar-item">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open?.index === index}
            className={open?.index === index ? "is-open" : ""}
            onClick={(event) => (open?.index === index ? close() : show(index, event.currentTarget))}
            onMouseEnter={(event) => {
              if (open && open.index !== index) show(index, event.currentTarget);
            }}
          >
            {menu.label}
          </button>
          {open?.index === index ? <MenuList items={menu.items} at={open.at} close={close} /> : null}
        </div>
      ))}
    </nav>
  );
}

// A right-click menu can be opened from anywhere with `openContextMenu`.

let context: { x: number; y: number; items: MenuItem[] } | null = null;
const watchers = new Set<() => void>();

function setContext(next: typeof context): void {
  context = next;
  watchers.forEach((watcher) => watcher());
}

export function openContextMenu(event: { clientX: number; clientY: number; preventDefault: () => void }, items: MenuItem[]): void {
  event.preventDefault();
  setContext({ x: event.clientX, y: event.clientY, items });
}

export function ContextMenu() {
  const ref = useRef<HTMLDivElement>(null);
  const current = useSyncExternalStore(
    (watcher) => {
      watchers.add(watcher);
      return () => watchers.delete(watcher);
    },
    () => context,
  );
  const close = () => setContext(null);
  useDismiss(current !== null, close, ref);
  if (!current) return null;
  return (
    <div ref={ref}>
      <MenuList items={current.items} at={{ left: current.x, top: current.y, flipLeft: current.x }} close={close} />
    </div>
  );
}
