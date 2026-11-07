import type { ItemSummary } from "@recorte/shared";
import { useState, type CSSProperties, type ReactNode } from "react";
import { timeAgo } from "../lib/text";
import { CheckIcon } from "./icons";

type Props = {
  item: ItemSummary;
  height: number;
  clipped: boolean;
  onOpen: (it: ItemSummary) => void;
  /** Multi-select mode: clicking toggles instead of opening. */
  selecting?: boolean;
  selected?: boolean;
  fresh?: boolean;
  action?: ReactNode;
};

export function CaptureTile({ item: c, height, clipped, onOpen, selecting, selected, fresh, action }: Props) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`relative ${fresh ? "fade-in" : ""}`}>
      <button
        type="button"
        className="tile"
        data-selected={selecting ? selected : undefined}
        onClick={() => onOpen(c)}
        style={{ "--glow": c.color } as CSSProperties}
        aria-label={`${c.title}, ${c.site}`}
        aria-pressed={selecting ? !!selected : undefined}
      >
        <div className="tile-media" style={{ height }}>
          <img
            src={c.thumb}
            alt=""
            width={c.width || undefined}
            height={c.height || undefined}
            loading="lazy"
            decoding="async"
            data-loaded={loaded}
            onLoad={() => setLoaded(true)}
          />
          {clipped && <div className="tile-clip-fade" />}
          <div className="tile-caption">
            <p className="line-clamp-2 text-[13.5px] leading-snug font-normal text-white">{c.title}</p>
            <p className="mt-1 flex gap-2.5 text-[12px] text-[var(--ink-3)]">
              <span className="truncate">{c.site}</span>
              <span className="shrink-0">{timeAgo(c.createdAt)}</span>
            </p>
          </div>
          {selecting && (
            <span className="tile-check" aria-hidden="true">
              {selected && <CheckIcon width={14} height={14} />}
            </span>
          )}
        </div>
      </button>
      {action && <div className="absolute top-2.5 right-2.5">{action}</div>}
    </div>
  );
}
