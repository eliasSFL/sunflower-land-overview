import { useEffect, useState } from "react";

// True while the user is interacting with the page, false after
// `idleMs` of stillness. Used by the floating HUD buttons (Settings,
// Refresh, NavMenu) to slide off-screen when the user is reading
// rather than navigating.
//
// Activity signals:
//   * scroll (any direction)
//   * tap / click anywhere on the page — UNLESS the tap lands on a
//     `<summary>` element (the toggle for a collapsible `<details>`,
//     e.g. TimerCard's drill-down). Those taps just open / close an
//     in-page section and shouldn't count as "user wants the HUD".
//
// Starts `true` so the buttons are present on first paint, then
// idles out on its own.
//
// Desktop (`sm+`) pins the discs on-screen via CSS overrides, so we
// report visible there regardless of idle — otherwise the visibility
// driven a11y attributes (aria-hidden / tabIndex) would hide buttons
// that are still on-screen and clickable.
const DESKTOP_QUERY = "(min-width: 640px)";

export function useHudActivity(idleMs: number = 2000): boolean {
  const [active, setActive] = useState(true);
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia(DESKTOP_QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    let timer = window.setTimeout(() => setActive(false), idleMs);

    const ping = () => {
      setActive(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setActive(false), idleMs);
    };

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (target && target.closest("summary")) return;
      ping();
    };

    // `passive: true` because we only read events, never call
    // preventDefault — keeps the scroll / input threads free.
    window.addEventListener("scroll", ping, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    return () => {
      window.removeEventListener("scroll", ping);
      window.removeEventListener("pointerdown", onPointerDown);
      window.clearTimeout(timer);
    };
  }, [idleMs]);

  return isDesktop || active;
}
