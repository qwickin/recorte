import type { Classifier } from "@recorte/ai";
import type { Search, SearchDoc, SearchQuery, SearchResult } from "../src/search";

/** Members of a no-op Search, spreadable into a partial fake. */
export const stubSearch = {
  ensureIndex: async (): Promise<void> => {},
  replaceAll: async (): Promise<void> => {},
};

/** In-memory Search: substring match on title/note/tags/keys/text, honours userId (and the other filters) like Meili. */
export class InMemorySearch implements Search {
  docs = new Map<string, SearchDoc>();
  queries: SearchQuery[] = [];
  failIndex = 0; // number of upcoming index() calls that throw

  async ensureIndex(): Promise<void> {}
  async index(doc: SearchDoc): Promise<void> {
    if (this.failIndex > 0) {
      this.failIndex--;
      throw new Error("index down");
    }
    this.docs.set(doc.id, doc);
  }
  async remove(id: string): Promise<void> {
    this.docs.delete(id);
  }
  async replaceAll(userId: string, docs: SearchDoc[]): Promise<void> {
    for (const [id, d] of this.docs) if (d.userId === userId) this.docs.delete(id);
    for (const d of docs) this.docs.set(d.id, d);
  }
  async search(q: SearchQuery): Promise<SearchResult[]> {
    this.queries.push(q);
    const needle = q.q.toLowerCase();
    return [...this.docs.values()]
      .filter((d) => d.userId === q.userId)
      .filter((d) => [d.title, d.note, d.text, ...d.tags, ...d.keys].join(" ").toLowerCase().includes(needle))
      .map((d) => ({ id: d.id, score: 1, highlight: { title: d.title } }));
  }
}

export const fakeClassifier = (tipo: string[] = ["mapa"], visual: string[] = []): Classifier & { calls: number } => ({
  calls: 0,
  async classify() {
    this.calls++;
    return { tipo, visual, scores: {} };
  },
});
