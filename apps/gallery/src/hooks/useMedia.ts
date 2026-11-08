import { useSyncExternalStore } from "react";

/** A media query as React state (e.g. the phone layout, where dialogs become full-screen sheets). */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (fn) => {
      const m = matchMedia(query);
      m.addEventListener("change", fn);
      return () => m.removeEventListener("change", fn);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}

/** Phones (the brief's ≥360 px up to Tailwind's `sm`). */
export const PHONE = "(max-width: 639.98px)";
