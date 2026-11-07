import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";

// Tiny History API router: one path, no params, no dependency.
const EVENT = "recorte:navigate";

function subscribe(fn: () => void) {
  window.addEventListener("popstate", fn);
  window.addEventListener(EVENT, fn);
  return () => {
    window.removeEventListener("popstate", fn);
    window.removeEventListener(EVENT, fn);
  };
}

const normalize = (p: string) => (p.length > 1 ? p.replace(/\/+$/, "") : p);

export const usePath = () => useSyncExternalStore(subscribe, () => normalize(window.location.pathname));

export function navigate(to: string, { replace = false } = {}) {
  if (to === window.location.pathname + window.location.search) return;
  if (replace) window.history.replaceState(null, "", to);
  else window.history.pushState(null, "", to);
  window.scrollTo({ top: 0 });
  window.dispatchEvent(new Event(EVENT));
}

export function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(href);
  };
  return <a href={href} onClick={handle} {...rest} />;
}
