import { isLocale, type Locale, pickLocale } from "@recorte/shared";

/**
 * The gallery's language: the choice saved in this browser (Settings / sign-in pages), else the browser's own
 * languages (`navigator.languages`). Kept outside React so non-component code can read it.
 */
const KEY = "recorte:locale";

const read = (): Locale | null => {
  try {
    const v = localStorage.getItem(KEY);
    return isLocale(v) ? v : null;
  } catch {
    return null;
  }
};

export const browserLocale = (): Locale =>
  pickLocale(typeof navigator === "undefined" ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]);

let preference: Locale | null = typeof window === "undefined" ? null : read();
let detected: Locale = browserLocale();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("languagechange", () => {
    detected = browserLocale();
    emit();
  });
  // Another tab changed the choice.
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY) return;
    preference = read();
    emit();
  });
}

export const getLocale = (): Locale => preference ?? detected;
export const getDetected = (): Locale => detected;
export const getPreference = (): Locale | null => preference;

/** `null` = automatic (follow the browser). */
export function setPreference(l: Locale | null): void {
  preference = l;
  try {
    if (l) localStorage.setItem(KEY, l);
    else localStorage.removeItem(KEY);
  } catch {
    // private mode: the choice lasts until the tab closes
  }
  emit();
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Before the first render, so nothing reads the old <html lang>.
if (typeof document !== "undefined") document.documentElement.lang = getLocale();
