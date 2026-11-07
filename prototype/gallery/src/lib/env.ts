import { createContext, useContext } from "react";

/** `vite build --mode embed`: single-file build shown inline in T3 (fixed-height box, internal scroll). */
export const EMBED = import.meta.env.MODE === "embed";

/** Element that scrolls the page: null = the window. */
export const ScrollRootContext = createContext<HTMLElement | null>(null);
export const useScrollRoot = () => useContext(ScrollRootContext);
