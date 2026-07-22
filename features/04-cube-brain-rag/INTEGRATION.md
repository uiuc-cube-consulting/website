# INTEGRATION · CUBE Brain (RAG)

Members-only chat at `/portal/brain`. Works with no configuration (extractive mode); add a
Gemini key for synthesized answers.

## Files outside this folder

| File | Change | Why |
|---|---|---|
| `app/portal/brain/page.tsx` | **new** — shim | Auth-gated `/portal/brain` route. |
| `app/api/brain/route.ts` | **new** — shim (POST) + local `dynamic` | Retrieve + answer endpoint. |
| `app/portal/layout.tsx` | **+1 line** in `<nav>` | "CUBE Brain" link. |
| `.env.example` | **+ Gemini section** | `GEMINI_API_KEY`, `GEMINI_MODEL`. |

## Configuration

- `GEMINI_API_KEY` — optional. Without it the assistant returns extractive (keyword) answers;
  with it, Gemini synthesizes grounded answers with citations via the Generative Language REST API.
  Get a free-tier key at https://aistudio.google.com/apikey.
- `GEMINI_MODEL` — optional, default `gemini-2.5-flash`.

No SDK dependency — `lib/generate.ts` calls the Gemini REST endpoint directly, so there's
nothing new to `npm install`.

## Confidentiality

The corpus is internal (CUBE's own past projects) and the route is auth-gated, so client
material stays within the member boundary. Review Google's data-use terms for the Gemini API tier
you use. Keep any externally-facing/productized version (menu #6) on isolated, consented corpora.

## Data + eval

```bash
node features/04-cube-brain-rag/scripts/build-corpus.mjs   # rebuild after new semesters
node features/04-cube-brain-rag/scripts/eval.mjs            # retrieval gate (4/4 expected)
```

## Verify

```bash
npx tsc --noEmit
npx eslint features/04-cube-brain-rag
```

## Commit as a unit

```bash
git add features/04-cube-brain-rag app/portal/brain app/api/brain app/portal/layout.tsx .env.example
git commit -m "feat: CUBE Brain RAG assistant at /portal/brain (#4)"
```

## Phase 2 (SPEC.md)

Ingest full deliverables/slides/playbooks from Drive (the bot's service account already has
Drive access); switch retrieval to Supabase pgvector embeddings; add feedback logging to a
`queries` table to measure retrieval quality and onboarding ramp.

## Remove cleanly

```bash
rm -rf features/04-cube-brain-rag app/portal/brain app/api/brain
# remove the "CUBE Brain" line from app/portal/layout.tsx and the Gemini block in .env.example
```
