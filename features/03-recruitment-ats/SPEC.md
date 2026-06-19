# SPEC · Recruitment ATS in the Portal  (#3 in the build plan & menu)

> Status: **spec'd, not yet built.** The single project that most directly compounds:
> better recruiting → better members → better deliverables → better case studies → easier
> recruiting.

## Problem

Recruitment happens twice a year and is the lifeblood of the org, but it runs on
`forms.gle` (`SITE.applyForm` in `lib/content.ts`) plus manual review. There's no shared
applicant record, no calibrated multi-reviewer scoring, no scheduling, and no funnel
analytics. Reviewer effort is uneven and decisions are hard to defend or learn from.

## Goal

An applicant tracking system in the portal: structured intake → multi-reviewer scoring on a
calibrated rubric → interview scheduling → funnel analytics, all gated behind the auth that
already exists. Built ahead of the next recruitment cycle.

Stages: `applied → screened → interview → offer → accepted (or rejected/withdrawn)`.

## What already exists (grounding)

- Portal auth (`auth.ts`): Google + email allowlist → every reviewer is an authenticated,
  known member. Reviewer identity = `session.user.email`, free.
- **`@supabase/supabase-js` is already in `package.json`.** That's the right backend here:
  concurrent multi-reviewer writes, rubric aggregation, and assignment locking are painful
  in Sheets but native in Postgres. This feature is presumably why the dep is already there.
- The outreach bot's Gmail send pattern (`gmail_send.py`, service-account + domain-wide
  delegation) can be reused to send applicant status emails from a CUBE address.
- Portal UI chrome + brand tokens for the reviewer console.

## Data model (Supabase / Postgres)

```
applicants(id, name, email, year, major, college, responses jsonb, status, created_at)
reviews(id, applicant_id, reviewer_email, scores jsonb, weighted_total, notes, created_at)
   -- unique(applicant_id, reviewer_email); rubric e.g. 4 criteria × 1–5
assignments(applicant_id, reviewer_email, assigned_at)   -- spread load, avoid double/under-review
interview_slots(id, starts_at, capacity, location)
interviews(id, applicant_id, slot_id, panel, outcome, created_at)
decisions(applicant_id, decision, decided_by, decided_at)
```

Row-Level Security so reviewers see the queue but only write their own reviews; leadership
sees aggregates and decisions.

## Calibrated rubric

Fixed criteria (e.g. *problem-solving, communication, drive, fit*), each scored 1–5 with
written anchors so a "4" means the same thing to every reader. ≥2 independent reviews per
applicant; surface **inter-reviewer variance** and each reviewer's mean vs. the cohort mean
to catch easy/harsh graders. Final ranking uses the calibrated average, not raw scores.

## Stack decisions

- **Supabase (already a dep)** for the applicant store, reviews, scheduling. Use the service
  role only server-side (API routes); never expose it to the client.
- **Public intake page** (e.g. `/apply` or `/join-us/apply`) writes to `applicants` via a
  server action / `/api/recruitment/apply`. Replaces or feeds from the Google Form so the
  data lands structured. Keep `forms.gle` as a fallback during transition.
- **Reviewer console** in the portal (`/portal/recruiting`): assigned queue, blind-ish review
  (hide other scores until you submit), rubric form, calibration view. Reviewer = session email.
- **Analytics dashboard**: counts per stage, reviewer throughput, score histograms, yield.
- **Status emails** via the bot's Gmail/service-account pattern.

## Task breakdown (semester-sized, build before next cycle)

1. **Schema + RLS** in Supabase; typed data layer (`lib/recruiting.ts`). *(~1 wk)*
2. **Structured intake** page → `applicants`; migrate the Google Form questions. *(~3–4 days)*
3. **Reviewer console** — assignment, rubric scoring, prevent double/under-review,
   blind-until-submit. *(~1.5 wks)*
4. **Calibration** — variance flags, reviewer-vs-cohort means, normalized ranking. *(~4 days)*
5. **Funnel analytics** — stage counts, throughput, score distributions, **yield**. *(~4 days)*
6. **Interview scheduling** — publish slots, candidate self-book, panel assignment. *(~1 wk)*
7. **Decisions + emails** — record outcomes, send templated accept/reject/interview emails. *(~3 days)*

## Success metrics

**Applicant volume**, **reviewer throughput** (reviews/reviewer, time-to-first-review),
and **yield** (offers → accepts). Over cycles: whether calibrated scores predict retained,
high-performing members — closing the compounding loop.

## Risks / notes

- Applicant data is sensitive — keep behind the allowlist, RLS-enforced; don't email raw
  scores; define a retention policy.
- Calibration only works if reviewers actually use the anchors — invest in a short norming
  session and clear rubric copy.
