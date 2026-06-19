# SPEC · "CUBE Brain" — Internal RAG Assistant  (#4 in the build plan, #5 in the menu)

> Status: **spec'd, not yet built.** The highest-ceiling bet: improves delivery quality,
> accelerates onboarding, and — critically — becomes a **sellable offering** once it works
> internally (the bridge to menu #6, productizing the AI capability).

## Problem

A decade of deliverables and hard-won playbooks live scattered across Drive folders, docs,
and slide decks. New members re-derive context every semester; teams re-solve problems other
teams already solved. There's no way to ask "how did we approach market sizing for the
Inprentus AR project?" and get a grounded answer.

## Goal

A retrieval-augmented assistant in the portal, grounded in CUBE's own past deliverables +
playbooks, that answers members' questions **with citations** to the source material. It
improves delivery consistency, ramps new members faster, and is dogfooded into a service we
can sell ("we built our own internal RAG assistant — we'll build yours").

## What already exists (grounding)

- The outreach bot already uses **Claude** for generation (`draft.py` "Claude
  personalization", `llm.py`) and already parses past projects (`past_projects.py`,
  `data/past_projects.json`). Reuse the Anthropic key/pattern and the parsed corpus as a
  starting seed.
- The bot's service account already has **Google Drive API** enabled (per its README's GCP
  setup) — the ingestion path to deliverables/slides is already authorized.
- **`@supabase/supabase-js` is already a dependency** → use **Supabase pgvector** as the
  vector store; no new infra, and it co-locates with the ATS data (#3).
- Portal auth gates access to members only — essential, since deliverables are client-
  confidential.

## Architecture

```
Ingestion (offline, re-runnable):
  Drive docs/slides + Past Projects.docx + playbooks
    → parse (docx/pdf/pptx → text)  → chunk (~500–800 tokens, overlap)
    → embed  → store in Supabase pgvector (chunk text + source metadata + URL)

Query (portal):
  member question → embed → top-k similarity search (pgvector)
    → assemble context  → Claude (answer + inline citations)  → stream to chat UI
```

## Data model (Supabase + pgvector)

```
documents(id, title, source_type, drive_url, semester, client, owner_team, ingested_at)
chunks(id, document_id, ord, content, embedding vector(N), token_count)
   -- ivfflat/hnsw index on embedding
queries(id, user_email, question, retrieved_chunk_ids, answer, rating, created_at)
```

`queries` doubles as the eval log and the onboarding-ramp metric source.

## Stack decisions

- **Vector store: Supabase pgvector** (already have Supabase). One less system to run.
- **LLM: Claude** (already used by the bot) for synthesis; **embeddings** from a dedicated
  embedding model — pick one provider and pin it (re-embedding everything on a model change
  is the main migration cost, so decide deliberately).
- **Ingestion via the bot's Drive service account.** Start with the corpus already parsed
  (`past_projects.json`) to prove the loop, then add full deliverables/slides + playbooks.
- **Interface: portal chat** at `/portal/brain` (auth-gated). Streamed responses, **always
  show citations** (which deliverable + section), thumbs feedback into `queries`.
- **Confidentiality first.** Members-only; never send client-confidential content to any
  endpoint that would train on it; respect per-client sensitivity. This is also what makes
  the eventual *productized* version (per-client, isolated corpora) credible.

## Task breakdown (semester-sized; this is the high-effort one)

1. **Corpus inventory + access** — catalog Drive folders, the Past Projects docx, playbooks;
   decide what's in scope and how sensitive each is. *(~1 wk)*
2. **Ingestion pipeline** — fetch → parse (docx/pdf/pptx) → chunk → embed → upsert into
   pgvector; idempotent + re-runnable. Seed from `past_projects.json` first. *(~1.5 wks)*
3. **Retrieval API** — embed query → top-k search → context assembly → Claude with strict
   citation formatting → stream. `/api/brain` (auth-gated). *(~1 wk)*
4. **Eval harness** — a fixed set of real questions with known correct sources; measure
   retrieval hit-rate and answer faithfulness **before** members trust it. *(~4 days)*
5. **Chat UI** — `/portal/brain`: history, inline citations, feedback. *(~1 wk)*
6. **Onboarding hook** — link from portal resources; seed with FAQ-style starter questions. *(~3 days)*
7. **(Later) Productize → menu #6** — multi-tenant, client-scoped corpora; package as the
   "AI / Automation" service-line proof point on the services page. *(scoped separately)*

## Success metrics

**Onboarding ramp time** (time for a new member to get productive; falling query volume on
"how do we…" basics is a good proxy) and **deliverable consistency** (teams converging on
shared playbooks). Track citation click-through and thumbs ratings from `queries` as
retrieval-quality signals.

## Risks / notes

- **Cost**: embeddings (one-time-ish) + per-query Claude calls — budget and cache.
- **Hallucination**: enforce "answer only from retrieved context + cite, or say you don't
  know." The eval harness (step 4) is non-negotiable before rollout.
- **Confidentiality / IP**: client deliverables must never leak past the member boundary;
  get explicit comfort before any externally-facing/productized version.
- Highest effort of the four — sequence it last, after the foundation (#1–#3) is connected.
