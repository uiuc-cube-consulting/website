# INTEGRATION · Pipeline / CRM

Members-only, **exec-board-only** Kanban board. **Editable (v2):** drag cards between
stage columns and click a card to edit its fields/notes/custom data. The board reads/writes
a Supabase `pipeline_leads` store; "Sync from outreach sheet" imports the bot's `Leads` tab
into that store (new leads inserted; human edits — stage, notes, custom, position — preserved).

## Editable board setup

1. Run **`db/schema.sql`** in Supabase (creates `pipeline_leads` + RLS). Reuses the same
   project/env as the rest of the app (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
2. Set `PIPELINE_SHEET_ID` (or it falls back to the bot's `SHEET_ID`) + `GOOGLE_SERVICE_ACCOUNT_JSON`
   so Sync can read the `Leads` tab.
3. In the board, click **Sync from outreach sheet** to populate. Without Supabase it shows demo data.

Data flow: bot Leads sheet → (Sync) → Supabase `pipeline_leads` → board. The board never writes
back to the bot's sheet, so automation is untouched; re-syncing refreshes source fields only.

## Files outside this folder

| File | Change | Why |
|---|---|---|
| `app/portal/pipeline/page.tsx` | **new** — re-export shim | Registers the auth-gated `/portal/pipeline` route (inherits portal layout + `proxy.ts`). |
| `app/api/pipeline/route.ts` | **new** — re-export shim + local `dynamic` | `GET /api/pipeline` — reads the Supabase store. |
| `app/api/pipeline/lead/route.ts` | **new** — re-export shim + local `dynamic` | `POST` — update a card (drag stage / edit fields). Exec-only. |
| `app/api/pipeline/import/route.ts` | **new** — re-export shim + local `dynamic` | `POST` — sync the bot sheet into the store. Exec-only. |
| `app/portal/layout.tsx` | **+1 line** in the portal `<nav>` | Adds the "Pipeline" link (exec-only). |
| `.env.example` | **pipeline section** | `PIPELINE_SHEET_ID`, `PIPELINE_SHEET_RANGE`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `PIPELINE_EXEC_ALLOWLIST` + the shared Supabase vars. |

The route shim pattern (note — only the handler is re-exported):
```ts
export { GET } from "@/features/02-pipeline-crm/app/api/pipeline/route";
export const dynamic = "force-dynamic";
```

## Access control — exec board only

Authorization reuses the **strike_system PR's auth** (`session.user.role`, loaded from the
Supabase `members` table). We do **not** define our own members table or Supabase client.

- `/portal/*` is gated by `proxy.ts`; the page also re-checks the session.
- `/api/pipeline` returns `401` if not signed in, and `403` unless `session.user.role === "exec"`.
  The board shows an "exec board only" state on 403.
- **To grant a non-exec member** (the "different restriction"): set their `role` to `exec` in the
  members table, or widen the allowed roles in `app/api/pipeline/route.ts` (mirrors
  strike_system's `STRIKE_ROLES` list).
- **Before strike_system merges** (auth not yet role-aware): `PIPELINE_EXEC_ALLOWLIST` (env,
  comma-separated emails) is the fallback; fully unconfigured → open for local dev.
- **Depends on** the strike_system foundation for the role in the session. No code is duplicated.

## Connecting the live Sheet

1. **Add a `Pipeline` tab** to the outreach Sheet (or reuse `Leads`). Column order (matches
   `PIPELINE_SHEET_RANGE=Pipeline!A2:O`):

   `name | company | email | industry | source | stage | owner | last_contacted | contacted_at | replied_at | call_at | loi_at | active_at | shipped_at | notes`

   `stage` is free-text and normalized (e.g. "emailed" → Contacted, "signed" → LOI) — see
   `STAGE_ALIASES` in `lib/pipeline.ts`.
2. **Auth:** because the Sheet holds prospect PII, set `GOOGLE_SERVICE_ACCOUNT_JSON` to the
   bot's service-account JSON (reads a private Sheet). `GOOGLE_API_KEY` also works but requires
   the Sheet be link-readable.
3. **Stamp stages from the bot (recommended):** have the outreach pipeline write `stage` +
   the matching `*_at` timestamp on transitions it already detects — `contacted` on send
   (`gmail_send.py`), `replied` on reply detection (`reply_check.py`), hot-lead → `call`. The
   timestamps are what make time-to-LOI and conversion metrics accurate.

Until configured, the board renders `DEMO_PIPELINE` from `lib/pipeline.ts`.

## Verify

```bash
npx tsc --noEmit
npx eslint features/02-pipeline-crm
# then: npm run dev → /portal/pipeline
```

## Commit as a unit

```bash
git add features/02-pipeline-crm \
        app/portal/pipeline/page.tsx \
        app/api/pipeline/route.ts \
        app/portal/layout.tsx .env.example
git commit -m "feat: pipeline/CRM board at /portal/pipeline (#2)"
```

## Phase 2 (scoped in SPEC.md)

- **Write-back:** drag-to-restage → service-account `values.update` + an audit trail.
- **Inbound on-ramp:** replace the Formspree `/contact` form with a qualifying intake that
  creates a `Prospect` row and drafts a first-pass SOW with Claude (reuse the bot's `draft.py`).

## Remove cleanly

```bash
rm -rf features/02-pipeline-crm app/portal/pipeline app/api/pipeline
# remove the "Pipeline" line from app/portal/layout.tsx and the pipeline block in .env.example
```
