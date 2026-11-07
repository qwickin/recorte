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

/** Meilisearch only does search; listing never goes through it. */
export interface Search {
  /** Creates/configures the index. Safe to call repeatedly. */
  ensureIndex(): Promise<void>;
  /** Drops every document of the user and indexes `docs` (admin "reindex"). */
  replaceAll(userId: string, docs: SearchDoc[]): Promise<void>;
  index(doc: SearchDoc): Promise<void>;
  remove(id: string): Promise<void>;
  search(query: SearchQuery): Promise<SearchResult[]>;
}

export class NoopSearch implements Search {
  async ensureIndex(): Promise<void> {}
  async replaceAll(): Promise<void> {}
  async index(): Promise<void> {}
  async remove(): Promise<void> {}
  async search(): Promise<SearchResult[]> {
    return [];
  }
}
