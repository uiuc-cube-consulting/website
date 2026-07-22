// RAG corpus + retrieval. v1 uses TF-IDF keyword retrieval over the committed
// corpus (data/corpus.json), which needs no API keys and works offline. The
// retrieval interface is intentionally small so it can be swapped for semantic
// (pgvector) retrieval later without touching callers — see SPEC.md.

import corpusData from "@/features/04-cube-brain-rag/data/corpus.json";

export type Chunk = {
  id: string;
  title: string;
  client: string;
  term: string;
  keywords: string[];
  text: string;
  source: string;
};

export type Retrieved = Chunk & { score: number };

const CHUNKS = (corpusData as { chunks: Chunk[] }).chunks;

const STOPWORDS = new Set(
  "the a an and or of to for in on with how did do does we our us you your i it is are was were be been being this that these those what which who whom when where why can could should would about into from at by as".split(
    " "
  )
);

function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

// Precompute document frequency for IDF weighting (rare terms matter more).
const DF = new Map<string, number>();
for (const c of CHUNKS) {
  const seen = new Set(tokenize(`${c.text} ${c.keywords.join(" ")}`));
  for (const t of seen) DF.set(t, (DF.get(t) ?? 0) + 1);
}
const N = CHUNKS.length;
function idf(term: string): number {
  const df = DF.get(term) ?? 0;
  return df === 0 ? 0 : Math.log((N + 1) / (df + 0.5));
}

export function corpusSize(): number {
  return N;
}

/** TF-IDF retrieval. Keyword field is boosted (it's the most topical signal). */
export function retrieve(query: string, k = 5): Retrieved[] {
  const qTerms = tokenize(query);
  if (qTerms.length === 0) return [];

  const scored = CHUNKS.map((c) => {
    const bodyTokens = tokenize(c.text);
    const kwTokens = tokenize(c.keywords.join(" "));
    const tf = new Map<string, number>();
    for (const t of bodyTokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of kwTokens) tf.set(t, (tf.get(t) ?? 0) + 2); // boost keyword matches

    let score = 0;
    for (const qt of qTerms) score += (tf.get(qt) ?? 0) * idf(qt);
    return { ...c, score: Math.round(score * 1000) / 1000 };
  });

  return scored
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
