# CUBE — Growth Engineering Roadmap

This directory holds the build plan for turning CUBE's two engineering assets — the
**website/portal** (`/`) and the **outreach bot** (`/project-acquisition`) — into one
connected ops platform, and turning the AI capability into a recruiting/sales
differentiator.

Each initiative lives in its **own self-contained folder** so it can be reviewed,
committed, and version-tracked independently. Every folder follows the same shape:

```
NN-feature-name/
  SPEC.md          scope, data model, stack decisions, semester-sized task breakdown, metrics
  INTEGRATION.md   exact steps to wire it into the live app (only present once built)
  README.md        one-paragraph "what this is" (only present once built)
  data/            generated + config data
  lib/             types and pure helpers
  components/       React components
  app/             pages + API route handlers (mirrors Next's app/ layout)
  scripts/         build/seed scripts
```

We chose the **integrated-module** approach: a feature's real code lives in its folder
and imports the app's shared auth/UI/tokens; tiny re-export shims in the app's `app/`
directory wire it into the router. So you get one folder to commit *and* zero code
duplication. Each `INTEGRATION.md` lists every file that lives outside the folder.

## Sequence

The order is deliberate: a fast public win first, then connect the two assets, then the
compounding membership play, then the high-ceiling AI bet.

| # | Folder | What it does | Effort | Primary metric | Status |
|---|--------|--------------|--------|----------------|--------|
| 1 | `01-case-study-engine` | Members-only, searchable/filterable library of the 102 past projects in the portal (`/portal/case-studies`). Internal knowledge base so members can pull relevant prior work by topic/keyword/practice area; NDA-safe behind auth. Data already exists. | Low | member reuse / onboarding ramp | **Built** |
| 2 | `02-pipeline-crm` | Pipeline board in the portal over the Sheets the bot already writes to (`prospect → contacted → replied → call → LOI → active → shipped → testimonial`). Connects the two assets; gives leadership a command center. | Medium | pipeline conversion rate, time-to-LOI | Spec'd |
| 3 | `03-recruitment-ats` | Applicant intake + multi-reviewer scoring + interview scheduling + funnel analytics, gated behind existing portal auth. Highest membership leverage; build ahead of next cycle. | Medium-High | applicant volume, reviewer throughput, yield | Spec'd |
| 4 | `04-cube-brain-rag` | Retrieval assistant grounded in past deliverables + playbooks ("how did we approach market sizing for Inprentus?"). Improves delivery, speeds onboarding, becomes a sellable offering. | High | onboarding ramp time, deliverable consistency | Spec'd |

## Why this set

These four move one of the four levers that actually grow the club — **clients,
recruits, delivery quality, retention** — and each builds on something CUBE already has.
Deliberately **out of scope**: more internal point-system gamification, a mobile app, and
LinkedIn auto-DM (the outreach README correctly flags it as ToS-risky). Fun, but they
don't grow the org.

## Layering in #5/#6 later

Two ideas from the original menu are positioning/build hybrids rather than discrete
folders, and are best layered on once the foundation is connected:

- **Smart intake + auto-scoped proposal (#2 in the menu):** replace the bare Formspree
  `/contact` form with a qualifying intake that drafts a first-pass SOW. Slots naturally
  into `02-pipeline-crm` as the inbound on-ramp.
- **Productize the AI capability (#6 in the menu):** add an "AI / Automation" tier to the
  services page using these internal tools as the proof point. Pure copy/positioning once
  `04-cube-brain-rag` works internally.
