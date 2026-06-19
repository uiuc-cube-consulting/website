# 01 · Case-Study Engine

A searchable, filterable library of CUBE's 100+ past client engagements, published in the
**members-only portal** at `/portal/case-studies`. Built from the data the outreach bot
already parsed (`project-acquisition/data/past_projects.json`), so there was nothing new to
collect — just to clean, classify, and surface.

It's an internal knowledge base: a member can pull up "have we done market sizing for a
hardware client before?" and find the relevant example to learn from or build on — searching
by topic, keyword, practice area, or client.

**Why members-only:** some engagements are under NDA, so a public portfolio is a real leak
risk. Gating it behind the existing portal auth makes the full client-named library safe to
browse internally.

```
01-case-study-engine/
  README.md            ← you are here
  SPEC.md              scope, data model, stack decisions, task breakdown, metrics
  INTEGRATION.md       every file this touches outside the folder + how to remove it
  data/
    anonymization.json editable config: hide specific clients behind an alias
    case_studies.json  generated dataset (committed) — 102 clean records
  scripts/
    build-case-studies.mjs   regenerates case_studies.json from the source
  lib/
    case-studies.ts    types + data loader + the shared filter/facet logic
  components/
    CaseStudyCard.tsx      one engagement card
    CaseStudyFilters.tsx   search + practice-area chips + term/sort controls
    CaseStudyLibrary.tsx   stateful library (stats header + filters + grid)
  app/
    portal/case-studies/page.tsx   the members-only page (auth-gated)
    api/case-studies/route.ts      auth-gated read-only JSON endpoint
```

## Regenerate the data

```bash
node features/01-case-study-engine/scripts/build-case-studies.mjs
```

Re-run after a new semester is added to the outreach bot's `past_projects.json`.

See **INTEGRATION.md** to wire it into (or remove it from) the live app, and **SPEC.md**
for the full design.
