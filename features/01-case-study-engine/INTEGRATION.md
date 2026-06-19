# INTEGRATION · Case-Study Engine

This feature is wired into the app as a **members-only** portal page. This doc records
**every file that lives outside this folder**, so the change set is auditable and trivially
reversible.

## Files outside this folder (the entire integration surface)

| File | Change | Why it's needed |
|---|---|---|
| `app/portal/case-studies/page.tsx` | **new** — 1-line re-export shim | Registers the auth-gated `/portal/case-studies` route. Next's App Router only scans `app/`, so the real page in this folder needs a shim here. Inherits `app/portal/layout.tsx` (portal chrome) and `proxy.ts` protection automatically. |
| `app/api/case-studies/route.ts` | **new** — 1-line re-export shim | Registers `GET /api/case-studies` (the handler itself checks the session). |
| `app/portal/layout.tsx` | **+1 line** in the portal `<nav>` | Adds the "Case Studies" link between Points and Resources. |

Everything else — data, components, page logic, API logic, the generator — lives entirely
inside `features/01-case-study-engine/`.

### Access control (how it's gated)

- `proxy.ts` already matches `/portal/:path*`, so the route is protected at the edge.
- The page re-checks `auth()` and redirects to `/portal/sign-in` if there's no session
  (defense-in-depth, matching the dashboard/points pages).
- The API route checks `auth()` and returns `401` otherwise (mirrors `app/api/points`).
- The page sets `robots: { index: false }`. **No public route exists** — the earlier public
  `/case-studies` page and nav link were removed.

### The shims (for reference)

`app/portal/case-studies/page.tsx`
```ts
export { default, metadata } from "@/features/01-case-study-engine/app/portal/case-studies/page";
```

`app/api/case-studies/route.ts`
```ts
// `dynamic` is route segment config — Next requires it declared in the route file,
// so re-export only the handler and declare the config locally.
export { GET } from "@/features/01-case-study-engine/app/api/case-studies/route";
export const dynamic = "force-dynamic";
```

This works because the repo's `@/*` path alias maps to the repo root (`tsconfig.json`),
so `@/features/...` resolves into this folder.

## Prerequisites

- `package.json` already includes everything used here. **No new dependencies.**
- The generator reads `project-acquisition/data/past_projects.json` at **build time only**
  (when you run the script). The runtime app reads the committed `data/case_studies.json`,
  so the website does **not** depend on the outreach-bot repo at runtime.

## Verify locally

```bash
npm run dev
# Sign in first at http://localhost:3000/portal/sign-in
# then open http://localhost:3000/portal/case-studies   → the library
# /api/case-studies returns 401 unless you're signed in (a signed-in browser session works)
```

Type-check and lint (both pass clean):
```bash
npx tsc --noEmit
npx eslint features/01-case-study-engine
```

> Note: a full `next build` couldn't be run in the authoring sandbox (it tries to fetch a
> platform-specific SWC binary and there was no registry network access). Run it on your
> machine; `tsc` already resolves and validates the shim re-exports.

## Update the data

```bash
node features/01-case-study-engine/scripts/build-case-studies.mjs   # rewrites data/case_studies.json
```
Commit the regenerated `case_studies.json`. To anonymize a client even internally, edit
`data/anonymization.json` (`anonymizeClients`) first, then re-run.

## Commit as a unit

```bash
git add features/01-case-study-engine \
        app/portal/case-studies/page.tsx \
        app/api/case-studies/route.ts \
        app/portal/layout.tsx
git commit -m "feat: members-only case-study library at /portal/case-studies (#1)"
```

## Remove the feature cleanly

```bash
rm -rf features/01-case-study-engine \
       app/portal/case-studies \
       app/api/case-studies
# then delete the "Case Studies" line from the <nav> in app/portal/layout.tsx
```
