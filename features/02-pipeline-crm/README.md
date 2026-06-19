# 02 · Pipeline / CRM

A pipeline board in the member portal at `/portal/pipeline`, built over the **same Google
Sheet the outreach bot already writes to**. It closes the loop between acquisition (the bot)
and delivery (the club): leadership gets one view of every prospect from cold lead to
testimonial, with funnel metrics, instead of the bot's work disappearing into a Sheet at the
hot-lead hand-off.

This is the **read path (phase 1)** — a live, filterable board + metrics. Drag-to-restage
write-back and the inbound intake on-ramp are scoped as phase 2 in SPEC.md.

```
02-pipeline-crm/
  README.md            ← you are here
  SPEC.md              scope, data model, stack decisions, task breakdown, metrics
  INTEGRATION.md       every file this touches outside the folder + how to remove it
  lib/
    pipeline.ts        PURE: stages, Lead type, metrics, access helper, demo data
                       (safe to import from client components)
    source.ts          SERVER-ONLY: Google Sheets reader (service-account → API-key → demo)
  components/
    PipelineBoard.tsx  client board: metrics + filters + Kanban (fetches /api/pipeline)
    PipelineMetrics.tsx funnel, reply/win rate, time-to-LOI, win-rate-by-source
    LeadCard.tsx       one lead card
  app/
    portal/pipeline/page.tsx   the members-only page (auth-gated)
    api/pipeline/route.ts      auth-gated feed (+ leadership allowlist)
```

## Run it

```bash
npm run dev
# sign in, then open http://localhost:3000/portal/pipeline
```

With no Sheet configured it shows **demo data**. To read the live Sheet, set
`PIPELINE_SHEET_ID` (+ `GOOGLE_SERVICE_ACCOUNT_JSON`, recommended for PII) in `.env.local`.
See INTEGRATION.md for the Sheet column contract and the bot-side changes that stamp stages.
