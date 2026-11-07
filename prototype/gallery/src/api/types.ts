// Contract between the gallery and the server. The mock in ./mock.ts implements it today;
// the real backend will expose the same shapes over HTTP:
//   GET /api/captures?cursor=&tag=&tag=&limit=   GET /api/tags   GET /api/search?q=
export type CaptureKind = "area" | "visible" | "full";

export type Capture = {
  id: string;
  url: string;
  pageTitle: string;
  kind: CaptureKind;
  createdAt: string; // ISO 8601
  image: {
    src: string; // full size (served through an authenticated route)
    thumb: string; // ~640px wide
    width: number;
    height: number;
    color: string; // dominant colour, used for placeholders and glow
  };
  // Written by the AI step on the server.
  title: string;
  description: string;
  tags: string[];
  keywords: string[];
  visibleText: string;
};

export type Page<T> = { items: T[]; nextCursor: string | null; total: number };

export type TagCount = { tag: string; count: number };

export type SearchHit = { capture: Capture; score: number; matched: string[] };

export interface GalleryApi {
  listCaptures(p: { cursor?: string | null; tags?: string[]; limit?: number; signal?: AbortSignal }): Promise<Page<Capture>>;
  listTags(p?: { signal?: AbortSignal }): Promise<TagCount[]>;
  search(q: string, p?: { limit?: number; signal?: AbortSignal }): Promise<SearchHit[]>;
}
