# INTEGRATION · Pipeline / CRM

Built as a members-only portal page (read path, phase 1). This records every file outside
the folder and how to feed it real data.

## Files outside this folder

| File | Change | Why |
|---|---|---|
| `app/portal/pipeline/page.tsx` | **new** — re-export shim | Registers the auth-gated `/portal/pipeline` route (inherits portal layout + `proxy.ts`). |
| `app/api/pipeline/route.ts` | **new** — re-export shim (handler) + local `dynamic` | Registers `GET /api/pipeline`. `dynamic` is declared locally because route segment config can't be re-exported. |
| `app/portal/layout.tsx` | **+1 line** in the portal `<nav>` | Adds the "Pipeline" link. |
| `.env.example` | **+ pipeline section** | Documents `PIPELINE_SHEET_ID`, `PIPELINE_SHEET_RANGE`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `PIPELINE_EXEC_ALLOWLIST`. |

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
