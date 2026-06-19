# SPEC · Pipeline / CRM in the Portal  (#2 in the build plan, #1 in the original menu)

> Status: **built — read path (phase 1).** Live board + funnel metrics at
> `/portal/pipeline`, reading the outreach Sheet (demo data until configured). Write-back and
> the inbound intake on-ramp remain phase 2 (below). This is the highest "build on what
> exists" move — it connects CUBE's two engineering assets (the outreach bot and the portal)
> into one loop.

## Problem

The outreach bot and the member portal are siloed. The bot sources leads, drafts/sends
cold emails, detects replies, and flags hot leads — writing everything to a Google Sheet.
But at the hot-lead hand-off, per the bot's own README, "the director takes over manually"
with **zero shared visibility**. Leadership can't see the funnel; acquisition and delivery
are disconnected. The bot's README even lists "web dashboard (Sheets is enough)" and
"LOI/contract automation" as deferred v1 scope. **This is that deferred layer.**

## Goal

A pipeline board in the portal that visualizes the same Sheet the bot already writes to,
giving leadership a command center and closing the loop between acquisition and delivery.

Stages: `prospect → contacted → replied → call booked → LOI → active → shipped → testimonial`.

## What already exists (grounding)

- `lib/sheets.ts` — the portal already reads Google Sheets (currently the points tab) with
  a read-only API key. Pattern to extend.
- `app/api/points/route.ts` — auth-gated JSON API pattern (NextAuth session check) to copy.
- The portal is auth-gated (`auth.ts`, Google + allowlist) — leadership-only views are free.
- The bot (`project-acquisition`) owns the Sheet and a **service account with Sheets write**
  access. It already detects sends, replies, and hot leads (`reply_check.py`,
  `summary.py`) — the stage transitions mostly already happen; they just aren't recorded as
  a stage or surfaced.

## Data model

Single source of truth stays the **outreach Sheet**. Add a `Pipeline` view — either new
columns on the existing `Leads` tab or a dedicated `Pipeline` tab the bot maintains:

```
lead_id | name | company | email | industry | source        | stage          | owner
        |      |         |       |          | (apollo/etc)  | (enum above)   | (director)
last_contacted | replied_at | call_at | loi_at | active_at | shipped_at | notes | sheet_row
```

Stage timestamps make the funnel metrics (time-in-stage, time-to-LOI) fall out for free.
The bot stamps transitions it already knows about (`contacted` on send, `replied` on reply
detection, hot-lead → `call booked` candidate); humans set the later stages.

## Stack decisions

- **Read path first.** Extend `lib/sheets.ts` with a `fetchPipeline()` that reads the
  Pipeline range; add `/api/pipeline` (auth-gated, mirrors `points`). Render a read-only
  Kanban at `/portal/pipeline`. This ships value with zero write risk.
- **Private sheet → service-account read.** The points sheet is link-readable with an API
  key; the pipeline holds prospect PII, so read it with a **service-account JWT** (the bot
  already has one) rather than a public API key. Add `googleapis` JWT auth in `lib/sheets.ts`
  (the dep is already installed).
- **Write-back is phase 2.** Drag-a-card-to-change-stage writes back via the service account
  with an audit trail (who moved what, when). Optimistic UI; Sheet remains source of truth.
- **No new database.** Keeping the Sheet as the store preserves the bot's single-source-of-
  truth loop and the club's "Sheets is enough" philosophy.

## Task breakdown (semester-sized)

1. **Sheet contract** — define Pipeline columns/tab; update the bot to stamp `stage` +
   timestamps on the transitions it already detects (`gmail_send.py`, `reply_check.py`). *(~1 wk)*
2. **Read API** — `fetchPipeline()` + service-account auth in `lib/sheets.ts`; `/api/pipeline`
   route (auth-gated). *(~3 days)*
3. **Board UI** — `/portal/pipeline` Kanban: columns per stage, lead cards, per-stage counts,
   filter by owner/source. Reuse portal chrome + brand tokens. *(~1 wk)*
4. **Funnel metrics** — conversion rate between stages, time-in-stage, **time-to-LOI**, win
   rate by source/industry. *(~3 days)*
5. **Write-back** *(phase 2)* — drag-to-restage → service-account update + audit log. *(~1 wk)*
6. **Inbound on-ramp** *(menu #2)* — replace the bare Formspree `/contact` form with a
   qualifying intake (industry, problem, budget band, timeline) that creates a `Prospect`
   row **and** uses Claude to draft a first-pass scope/SOW (reuse the bot's `draft.py`
   Claude pattern). Turns inbound from a black hole into a half-drafted engagement. *(~1–2 wks)*

## Success metrics

**Pipeline conversion rate** (stage-to-stage), **time-to-LOI**, and inbound → qualified-call
rate once the intake on-ramp lands. Bonus: win rate by lead source tells the bot which Apollo
profiles to weight (`config/search_profiles.yaml`).

## Risks / notes

- Prospect data is PII — keep `/portal/pipeline` behind the leadership allowlist; read with a
  service account, not a public key.
- Coordinate the Sheet schema change with the bot's maintainer so a column rename doesn't
  break `sheets.py` on either side.
