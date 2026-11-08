export function normalizeTag(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase().slice(0, 40).trim();
}

export function normalizeTags(a: string[]): string[] {
  const out: string[] = [];
  for (const t of a) {
    const n = normalizeTag(t);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

/** The AI's shown tags: `topics` when the item was processed by the text tagger, else the old screenshot tags. */
export function aiTags(ai: { tipo: string[]; visual: string[]; topics?: string[] }): string[] {
  return ai.topics ?? [...ai.tipo, ...ai.visual];
}
