import type { CaptureKind, Category, ItemText, TagCount } from "@recorte/shared";
import type { Rect } from "./extract";

/** Messages between popup / content script / background. All carry a `type` with a "recorte:" prefix. */

export interface DialogInput {
  title: string;
  note: string;
  tags: string[];
  categoryId: string | null;
}

export interface PageMetrics {
  pageHeight: number;
  innerHeight: number;
  innerWidth: number;
  /** Viewport width without the vertical scrollbar. */
  clientWidth: number;
  scrollX: number;
  scrollY: number;
  dpr: number;
}

export interface Status {
  configured: boolean;
  server: string | null;
  /** Captures waiting for the current connection. */
  pending: number;
  /** Captures parked for another server/account (never sent to the current one). */
  parked: number;
  authNeeded: boolean;
  version: string;
  update: { version: string; url: string } | null;
}

/** popup / content → background */
export type BackgroundMessage =
  | { type: "recorte:capture"; kind: Exclude<CaptureKind, "image"> }
  | { type: "recorte:area-selected"; rect: Rect | null }
  | { type: "recorte:draft-save"; draftId: string; input: DialogInput }
  | { type: "recorte:draft-cancel"; draftId: string }
  | { type: "recorte:draft-info"; draftId: string }
  /** Without `account`: drop captures of every other connection. With it: drop that connection's captures. */
  | { type: "recorte:discard-parked"; account?: string }
  /** Drops the current connection's waiting captures (popup "Descartar"). */
  | { type: "recorte:discard-pending" }
  | { type: "recorte:tags" }
  | { type: "recorte:categories" }
  | { type: "recorte:create-category"; name: string }
  | { type: "recorte:open-gallery" }
  | { type: "recorte:open-options" }
  | { type: "recorte:status" }
  | { type: "recorte:connected" }
  | { type: "recorte:retry-queue" };

/** background → content script */
export type ContentMessage =
  | { type: "recorte:ping" }
  | { type: "recorte:start-area" }
  | { type: "recorte:metrics" }
  | { type: "recorte:scroll-to"; y: number; hideFixed: boolean }
  | { type: "recorte:restore"; x: number; y: number }
  | { type: "recorte:locate-image"; srcUrl: string }
  | { type: "recorte:extract"; kind: CaptureKind; rect?: Rect; image?: { alt: string; caption: string } }
  | { type: "recorte:dialog"; draftId: string }
  | { type: "recorte:close-dialog" }
  | { type: "recorte:toast"; text: string; tone: "ok" | "error"; action?: "open-gallery" | "open-options" }
  | { type: "recorte:prepare-capture" };

/** What the dialog page needs to show a draft. */
export interface DraftInfo {
  preview: string;
  title: string;
  site: string;
  truncated: boolean;
}

export interface LocatedImage {
  rect: Rect;
  /** Scroll position before the element was scrolled into view (restored after the capture). */
  scroll: { x: number; y: number };
  alt: string;
  caption: string;
}

export interface ExtractResult {
  text: ItemText;
  pageTitle: string;
}

export type TagsResponse = { ok: true; tags: TagCount[] } | { ok: false; error: string };
export type CategoriesResponse = { ok: true; categories: Category[] } | { ok: false; error: string };
export type CategoryResponse = { ok: true; category: Category } | { ok: false; error: string };
