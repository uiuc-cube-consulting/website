# 07 · Alumni directory

A members-only, searchable directory of CUBE alumni at `/portal/alumni`. Members search
by name, company, role or major and filter by:

- **where they are**: on campus (still a UIUC student) / off campus / unknown
- **field of study**: majors are grouped into families, and a double major counts in both
- **company**: companies with two or more alumni
- **open to mentoring**

Each card links to the alum's LinkedIn, plus their email and phone where CUBE has them.
Exec get **Add alum** and **Edit / Remove** on every card, so the directory is kept up to date
in the portal rather than in a spreadsheet.

The data lives in Supabase only. The repo is public, so no alumni rows, names or contact
details are committed here. See [INTEGRATION.md](INTEGRATION.md) for setup and the import.

| Path | What |
|---|---|
| `db/schema.sql` | The `alumni` table. RLS is on with no policies, so only the server reads it. |
| `lib/alumni.ts` | Types, search/filter/facets, major → field families, input validation. Pure, and tested in `__tests__/alumni`. |
| `lib/store.ts` | Supabase reads and writes. Server-only. |
| `app/portal/alumni/page.tsx` | The page. Shows a "not set up yet" state until the SQL has been run. |
| `app/api/alumni/…` | `POST` (add), `PATCH` / `DELETE` by id. Exec only. |
| `components/` | Directory (filters + grid), card, exec editor modal. |
| `scripts/import-alumni.mjs` | Insert-only bulk load from a local, gitignored JSON file. |
