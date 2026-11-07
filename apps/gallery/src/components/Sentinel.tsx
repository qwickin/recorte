import { useEffect, useRef } from "react";

/** Fires `onVisible` when the end of the list gets near; re-arms after every page. */
export function Sentinel({ onVisible, disabled, armKey }: { onVisible: () => void; disabled: boolean; armKey: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (disabled || !ref.current) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && onVisible(), {
      rootMargin: "0px 0px 900px 0px",
    });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [onVisible, disabled, armKey]);
  return <div ref={ref} className="h-px" aria-hidden="true" />;
}
