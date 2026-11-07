import { useState, type CSSProperties } from "react";
import type { Capture } from "../api/types";
import { domainOf, timeAgo } from "../lib/text";

type Props = { capture: Capture; height: number; clipped: boolean; onOpen: (c: Capture) => void };

export function CaptureTile({ capture: c, height, clipped, onOpen }: Props) {
  const [loaded, setLoaded] = useState(false);
  return (
    <button
      type="button"
      className="tile"
      onClick={() => onOpen(c)}
      style={{ "--glow": c.image.color } as CSSProperties}
      aria-label={`${c.title}, ${domainOf(c.url)}`}
    >
      <div className="tile-media" style={{ height }}>
        <img
          src={c.image.thumb}
          alt=""
          width={c.image.width}
          height={c.image.height}
          loading="lazy"
          decoding="async"
          data-loaded={loaded}
          onLoad={() => setLoaded(true)}
        />
        {clipped && <div className="tile-clip-fade" />}
        <div className="tile-caption">
          <p className="line-clamp-2 text-[13.5px] leading-snug font-normal text-white">{c.title}</p>
          <p className="mt-1 flex gap-2.5 text-[12px] text-[var(--ink-3)]">
            <span className="truncate">{domainOf(c.url)}</span>
            <span className="shrink-0">{timeAgo(c.createdAt)}</span>
          </p>
        </div>
      </div>
    </button>
  );
}
