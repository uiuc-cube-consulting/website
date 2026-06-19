# SPEC · Case-Study Engine

## Problem

CUBE has completed 100+ client engagements over a decade, but that knowledge isn't
discoverable. The public `/projects` page only shows the current semester (8 projects), and
the full history lives buried in `project-acquisition/data/past_projects.json` (102 records)
where the outreach bot uses it to generate credibility lines. Members who want to find a
relevant past example — "have we scoped a market-sizing project for a hardware client?" —
have no way to search it.

Two constraints shape the solution:

- **It must be members-only.** Some engagements are under NDA; a public, client-named
  portfolio is a real leak risk. So this is an *internal* tool, gated behind portal auth.
- **It should reuse what we have.** The data already exists; we clean, classify, and surface
  it rather than collecting anything new.

## Goal

A fast, searchable, filterable case-study library in the member portal that:

- surfaces all 102 past engagements, newest first;
- lets a member free-text **search by topic/keyword/client** and filter by **practice area**
  and **semester**, to pull up relevant prior work;
- is **members-only**, so real client names are safe to show internally;
- requires zero new data collection and no backend/database.

Explicitly **out of scope (v1):** per-project detail pages, client logos/photos for
historical projects, outcome metrics, and testimonials tied to each study. The data we have
is `semester / client / keywords / deliverables` — we ship exactly what that supports and
leave hooks for richer data later (see "Future").

## Data model

Source (`project-acquisition/data/past_projects.json`, one object per engagement):

```jsonc
{ "semester": "SP24", "client": "Inprentus",
  "keywords": ["Market size analysis", "Comp. Analysis", "Cost model analysis"],
  "deliverables": "Business portion of the project involves market size analysis…" }
```

`scripts/build-case-studies.mjs` transforms this into `data/case_studies.json`:

```ts
type CaseStudy = {
  id: string;            // stable slug, e.g. "inprentus-sp24"
  name: string;          // display name (real client, or alias if anonymized)
  anonymized: boolean;
  practiceAreas: string[]; // normalized facets (see taxonomy)
  keywords: string[];      // raw source keywords, kept for search recall
  summary: string;         // deliverables prose (or graceful placeholder)
  hasDetails: boolean;
  semester: string;        // "SP24"
  season: string;          // "Spring" | "Fall"
  year: number;            // 2024
  termLabel: string;       // "Spring 2024"
  termIndex: number;       // sortable; higher = newer
  engagements: number;     // # of semesters with this client
  repeatClient: boolean;   // engagements > 1
};
```

### The core transform: keyword normalization

The source has **188 distinct, inconsistent keywords** ("Comp. Analysis" vs "Competitor
Analysis", "Ui/Ux", "3D Modelling", "App Dev"). Raw, they're useless as filters. The build
script maps them into **7 clean practice areas** via an ordered, case-insensitive term
dictionary (short tokens like `ai`/`ml`/`ux` match on word boundaries):

| Practice area | ~count | Example source keywords folded in |
|---|---|---|
| Strategy & Research | 51 | Market Research, Market Entry, Comp. Analysis, Customer Development |
| Product & Hardware | 33 | CAD Design, Prototype Development, Arduino, UI/UX, Industrial Design |
| Marketing & Brand | 29 | Social Media, Product Launch, Branding, Content |
| Software & Data | 23 | Front End, Back End, App Dev, Data Visualization, Automation |
| Finance & Operations | 12 | Cost Model, Unit Economics, Pricing, Supply Chain |
| AI & Machine Learning | 6 | Machine Learning, Computer Vision, Predictive |
| General Consulting | 7 | (fallback — projects with no keywords *and* no deliverables) |

A project can belong to several areas. If keywords yield nothing, the script falls back to
scanning the deliverables prose; only if both are empty does it land in *General Consulting*
(7 records — confirmed genuinely empty in the source).

### Search built for "find a relevant example"

The whole point for members is pulling up prior work by topic. Free-text search matches
across `name + summary + termLabel + practiceAreas + keywords`, so a member can search a
specific content word ("battery", "go-to-market", "Arduino") **or** a topic, and the raw
source keywords are retained precisely to widen recall. Multi-word queries are AND-matched.

### Two derived signals worth calling out

- **Repeat clients.** Source names carried sequence markers — `EarthSense (4)`, `Banato (3)`
  — meaning the Nth engagement with that client. The script strips the marker for a clean
  name and counts engagements, exposing a "↻ 4× repeat client" badge — useful internal
  context on which relationships ran deep. (EarthSense 4×, Inprentus & Banato 3×, plus ~14
  two-timers.)
- **Term parsing.** `SP24 → {season: Spring, year: 2024, termIndex}` drives newest-first
  sort and the semester filter (22 terms, Spring 2013 → Spring 2024).

### Anonymization (defense-in-depth)

Making the library members-only is the primary NDA mitigation. `data/anonymization.json` adds
a second lever for any client whose terms restrict even *internal* naming: add their exact
source name to `anonymizeClients` and the build replaces it with `"Confidential {practice}
Client"`, never shipping the real name. Default is `show` (members can see real names), since
the auth gate already contains exposure.

## Stack decisions

- **Members-only, reusing the portal's auth.** The page lives at `/portal/case-studies`,
  protected by `proxy.ts` (which gates `/portal/*`) and a per-page session check, exactly like
  the dashboard and points pages. The API route re-checks the session and 401s otherwise
  (mirrors `app/api/points/route.ts`). No new auth to build.
- **No database.** 102 records is tiny. The data is a committed JSON file, imported directly.
  Rebuild is a script, not a migration. Matches the club's "Sheets is enough" philosophy and
  keeps hosting free on Vercel.
- **Server-render + client-filter.** The page is a Server Component that loads the JSON; a
  single Client Component (`CaseStudyLibrary`) does search/filter/sort in memory — instant,
  no network round-trips.
- **One filter function, two callers.** `filterCaseStudies()` in `lib/case-studies.ts` is
  pure and used by **both** the UI and the `/api/case-studies` route, so behavior can't drift.
- **Reuses the design system.** Portal page styling (eyebrow + display heading, brand tokens,
  `.btn` utilities) so it looks native to the portal — no new styling.
- **Integrated-module layout.** Real code lives in this folder; thin re-export shims under
  `app/` register the routes (see INTEGRATION.md). One folder to commit, zero duplication.

## Build / task breakdown (semester-sized)

This v1 is **built**. The breakdown below is how it was scoped and what a team would extend
next — sized for a small eng team across a semester.

1. **Data pipeline** *(done)* — taxonomy dictionary, term parser, repeat-client + anonymization
   logic, `case_studies.json` generator. *(~1 wk)*
2. **Library UI + portal wiring** *(done)* — types/loader, card, filter bar, stateful library,
   auth-gated portal page + API route, portal nav link. *(~1 wk)*
3. **Detail pages** *(next)* — `/portal/case-studies/[id]` with a fuller writeup; needs a
   richer source schema (challenge / approach / outcome / links to the actual deliverable).
   The build script already emits stable `id`s to route on. *(~1–2 wks)*
4. **Link to deliverables** *(next)* — attach the Drive doc/slide URL per study so a member can
   jump straight to the real artifact (members-only makes this safe). *(~3–4 days)*
5. **Usage instrumentation** *(next)* — log what members search/filter for; reveals internal
   demand and which past work gets reused. *(~2–3 days)*
6. **Auto-refresh** *(next)* — re-run the generator when `past_projects.json` changes (bot step
   or CI), so the library never goes stale. *(~2 days)*

## Success metrics

This is an internal tool, so metrics are about **reuse and ramp**, not public conversion:
member usage (searches/sessions, especially during project kickoff and onboarding), which
practice areas/keywords get queried (a read on internal demand), and qualitative: new members
ramping faster because prior work is findable. Naturally complements `04-cube-brain-rag`,
which answers the same "how did we do X?" question conversationally.

## Future hooks already in place

- Stable `id` per study → ready for `/portal/case-studies/[id]` detail routes.
- `anonymized` flag and config → ready for clients that restrict internal naming.
- `hasDetails` flag → ready to prompt for/badge studies that still need a writeup.
- Auth-gated `/api/case-studies` JSON endpoint → ready to feed the RAG assistant or a portal
  dashboard widget.
