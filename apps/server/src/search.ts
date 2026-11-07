export interface SearchDoc {
  id: string;
  userId: string;
  type: string;
  site: string;
  title: string;
  note: string;
  description: string;
  tags: string[];
  keys: string[];
  text: string;
  colors: string[];
  categoryId: string | null;
  createdAt: string;
}

export interface SearchQuery {
  userId: string;
  q: string;
  type?: string;
  site?: string;
  tags?: string[];
  category?: string;
  color?: string;
  limit?: number;
}

export interface SearchResult {
  id: string;
  score: number;
  highlight: { title?: string; text?: string };
}

/** Implemented by Task 5 (Meilisearch). Listing never goes through it. */
export interface Search {
  index(doc: SearchDoc): Promise<void>;
  remove(id: string): Promise<void>;
  search(query: SearchQuery): Promise<SearchResult[]>;
}

export class NoopSearch implements Search {
  async index(): Promise<void> {}
  async remove(): Promise<void> {}
  async search(): Promise<SearchResult[]> {
    return [];
  }
}
