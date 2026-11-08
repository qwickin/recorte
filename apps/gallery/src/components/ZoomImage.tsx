import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useT } from "../i18n";
import { clampView, initialView, isZoomed, panBy, pinchView, sameView, wheelFactor, zoomAt, type Point, type Size, type View } from "../lib/zoom";

type Props = {
  src: string;
  alt: string;
  /** Natural size when known up front (the summary has it); the decoded image's size wins otherwise. */
  width?: number;
  height?: number;
};

const HINT_KEY = "recorte:zoom-hint-seen";
const readSeen = () => {
  try {
    return localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return false;
  }
};
const coarse = () => typeof matchMedia === "function" && matchMedia("(hover: none) and (pointer: coarse)").matches;
const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The detail image: wheel zooms around the pointer, drag pans, double-click resets (or zooms in when
 * already reset), two fingers pinch and pan. One transform on one element, written straight to the DOM
 * from a rAF loop (no React render per frame).
 */
export function ZoomImage({ src, alt, width, height }: Props) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const natural = useRef<Size | null>(width && height ? { w: width, h: height } : null);
  const vp = useRef<Size>({ w: 0, h: 0 });
  const cur = useRef<View>({ s: 1, x: 0, y: 0 });
  const target = useRef<View>({ s: 1, x: 0, y: 0 });
  const raf = useRef(0);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ view: View; a: Point; b: Point } | null>(null);
  const moved = useRef(false);
  const [ready, setReady] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [pannable, setPannable] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [hint, setHint] = useState(() => !readSeen());
  const [touch] = useState(coarse);

  const write = useCallback(() => {
    const el = img.current;
    const v = cur.current;
    if (el) el.style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.s})`;
  }, []);

  const sync = useCallback(() => {
    const n = natural.current;
    const v = target.current;
    if (!n || !vp.current.w) return;
    setZoomed(isZoomed(v, n, vp.current));
    setPannable(n.w * v.s > vp.current.w + 0.5 || n.h * v.s > vp.current.h + 0.5);
  }, []);

  const settle = useCallback(() => {
    // Idle: drop the layer hint so Chrome re-rasterises the image sharp at its new scale.
    if (img.current) img.current.style.willChange = "";
  }, []);

  const tick = useCallback(() => {
    const c = cur.current;
    const t = target.current;
    const k = 0.32;
    const next = { s: c.s + (t.s - c.s) * k, x: c.x + (t.x - c.x) * k, y: c.y + (t.y - c.y) * k };
    if (sameView(next, t) || Math.abs(next.s - t.s) / t.s < 0.002) {
      cur.current = t;
      write();
      raf.current = 0;
      settle();
      return;
    }
    cur.current = next;
    write();
    raf.current = requestAnimationFrame(tick);
  }, [write, settle]);

  /** Moves to `v`: animated (wheel, double-click) or at once (drag, pinch). */
  const go = useCallback(
    (v: View, animate: boolean) => {
      target.current = v;
      if (img.current) img.current.style.willChange = "transform";
      if (!animate || reduced()) {
        cancelAnimationFrame(raf.current);
        raf.current = 0;
        cur.current = v;
        write();
        if (!pointers.current.size) settle();
      } else if (!raf.current) raf.current = requestAnimationFrame(tick);
      sync();
    },
    [tick, write, settle, sync],
  );

  const reset = useCallback(
    (animate: boolean) => {
      const n = natural.current;
      if (n && vp.current.w) go(initialView(n, vp.current), animate);
    },
    [go],
  );

  const used = useCallback(() => {
    if (!hint) return;
    setHint(false);
    try {
      localStorage.setItem(HINT_KEY, "1");
    } catch {
      /* private mode: the hint just comes back next time */
    }
  }, [hint]);

  // Viewport size; a resize keeps the view valid (clamped), the very first one sets the opening view.
  useLayoutEffect(() => {
    const el = box.current!;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const first = vp.current.w === 0;
      vp.current = { w: r.width, h: r.height };
      const n = natural.current;
      if (!n || !r.width) return;
      if (first) reset(false);
      else go(clampView(target.current, n, vp.current), false);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf.current);
    };
  }, [go, reset]);

  // Wheel must be a non-passive native listener, or preventDefault cannot stop the page from scrolling.
  useEffect(() => {
    const el = box.current!;
    const onWheel = (e: WheelEvent) => {
      const n = natural.current;
      if (!n || !vp.current.w) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const p = { x: e.clientX - r.left, y: e.clientY - r.top };
      go(zoomAt(target.current, wheelFactor(e.deltaY, e.deltaMode, e.ctrlKey), p, n, vp.current), true);
      used();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [go, used]);

  const local = (e: { clientX: number; clientY: number }): Point => {
    const r = box.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !natural.current) return;
    box.current!.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    moved.current = false;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [Point, Point];
      gesture.current = { view: cur.current, a, b };
    }
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    const n = natural.current;
    if (!prev || !n) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (Math.abs(p.x - prev.x) + Math.abs(p.y - prev.y) > 0) moved.current = true;
    if (pointers.current.size >= 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()] as [Point, Point];
      go(pinchView(gesture.current.view, gesture.current.a, gesture.current.b, a, b, n, vp.current), false);
      used();
    } else if (pointers.current.size === 1) {
      go(panBy(target.current, p.x - prev.x, p.y - prev.y, n, vp.current), false);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
    if (pointers.current.size === 0) {
      setDragging(false);
      settle();
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const n = natural.current;
    if (!n || !vp.current.w) return;
    const start = initialView(n, vp.current);
    if (sameView(target.current, start)) go(zoomAt(start, 2.5, local(e), n, vp.current), true);
    else go(start, true);
    used();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const n = natural.current;
    if (!n || e.metaKey || e.ctrlKey || e.altKey) return;
    const mid = { x: vp.current.w / 2, y: vp.current.h / 2 };
    if (e.key === "+" || e.key === "=") go(zoomAt(target.current, 1.4, mid, n, vp.current), true);
    else if (e.key === "-") go(zoomAt(target.current, 1 / 1.4, mid, n, vp.current), true);
    else if (e.key === "0") reset(true);
    else return;
    e.preventDefault();
    used();
  };

  const onLoad = () => {
    const el = img.current!;
    if (!natural.current || natural.current.w !== el.naturalWidth || natural.current.h !== el.naturalHeight) {
      natural.current = { w: el.naturalWidth, h: el.naturalHeight };
      reset(false);
    }
    setReady(true);
  };

  const n = natural.current;

  return (
    <div
      ref={box}
      className="zoom-box"
      data-zoomed={zoomed || undefined}
      data-pannable={pannable || undefined}
      data-dragging={dragging || undefined}
      tabIndex={0}
      role="img"
      aria-label={t("zoom.label", { alt })}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
    >
      <img
        ref={img}
        src={src}
        alt=""
        draggable={false}
        onLoad={onLoad}
        width={n?.w}
        height={n?.h}
        className="zoom-img"
        data-loaded={ready || undefined}
        style={n ? { width: n.w, height: n.h } : undefined}
      />
      <p className="zoom-hint" data-hidden={!hint || !ready || undefined} aria-hidden="true">
        {touch ? t("zoom.hintTouch") : t("zoom.hintMouse")}
      </p>
    </div>
  );
}
