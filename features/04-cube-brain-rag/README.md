# 04 · CUBE Brain — RAG Assistant

A members-only assistant at `/portal/brain` that answers "how have we done X before?" grounded
in CUBE's past engagements, with citations. v1 seeds its corpus from the 102 past projects.

**Tiered by config, useful at every tier:**
- **No keys:** TF-IDF keyword retrieval + an extractive answer (top matching projects). Works offline.
- **`ANTHROPIC_API_KEY` set:** Claude synthesizes a grounded answer with inline citations.
- **Later:** swap keyword retrieval for semantic (Supabase pgvector) — the `retrieve()` interface
  is isolated so callers don't change. See SPEC.md.

```
04-cube-brain-rag/
  README.md  SPEC.md  INTEGRATION.md
  data/corpus.json            generated corpus (committed) — 96 chunks
  scripts/build-corpus.mjs    rebuilds corpus.json from past_projects.json
  scripts/eval.mjs            retrieval sanity gate (run before trusting answers)
  lib/corpus.ts               TF-IDF retrieval (swap-in point for pgvector)
  lib/generate.ts             SERVER-ONLY: Claude (REST) or extractive fallback
  components/BrainChat.tsx     chat UI with citations
  app/portal/brain/page.tsx    members-only page
  app/api/brain/route.ts       auth-gated retrieve + answer
```

## Run / rebuild / eval

```bash
npm run dev                                              # then /portal/brain (sign in)
node features/04-cube-brain-rag/scripts/build-corpus.mjs # rebuild corpus
node features/04-cube-brain-rag/scripts/eval.mjs         # retrieval checks
```
