# SPEC · Accountability tracker (#5)

> Status: **built.** Weekly per-consultant QA ratings, filled by each project's PM/SC,
> read across all projects by exec, with an automated weekly reminder. Supabase-backed
> with a demo fallback.

## Problem

Quality assurance ran on a per-project Google Sheet: consultants down the rows, weeks
across the columns, and a Meets / Exceeds / Below dropdown in each cell. It worked, but:

- **The sheets are islands.** Exec has to open a different tab per project to see the
  semester, and nothing rolls up. A consultant coasting on one project and struggling on
  another is invisible.
- **Nothing chases anyone.** A PM who forgets week 4 is only discovered when someone
  scrolls past a column of blanks — usually at the end of the semester, when it is too
  late to coach anyone.
- **Access is all-or-nothing.** A shared sheet link is either open to whoever has it or a
  permissions chore every time a roster changes. Candid ratings need to stay leadership-only.
- **The signal is buried.** The one thing that matters — who was rated *Below*, and why —
  is a coloured cell you have to hunt for, with no space to say what actually happened.

## Goal

The same grid, in the portal: one screen, one click per cell, under two minutes a week —
and everything the sheet couldn't do (roll-up, reminders, per-project access, notes).

## Model

Three categories, rated per consultant per week:

| Category | What it reads |
|---|---|
| **Work Quality** | Deliverables, analysis, and how much rework the PM absorbs. |
| **Behavior & Professionalism** | Shows up, on time, prepared, communicates when plans change. |
| **Initiative & Ownership** | Picks work up unasked and carries it to done. |

Each is `below` / `meets` / `exceeds`, with an optional free-text note.

```
projects(id, name, client, cohort, starts_on, weeks, active)
project_members(project_id, member_id, seat)      -- seat: PM | SC | consultant
accountability_ratings(project_id, member_id, week, category, rating, note, rated_by)
   -- unique(project_id, member_id, week, category)
accountability_reminders(project_id, week, recipient_id, sent_at)
```

## Decisions

**One shared grid per project, not one per rater.** The PM and SC fill the same cells and
`rated_by` records whoever last touched one. Two independent grids would double the
work to surface disagreement that a two-person team can just talk about.

**Seat, not title.** Authority comes from `project_members.seat`, not `members.role`. A
member whose org role is `project_manager` has no access to a project they aren't on, and
a member sitting as a consultant is rated like anyone else. `members.role` only gates the
route; the seat gates the data.

This is not hypothetical: FA26 assigned SC seats on VerityXR and VoiceOS to two people
whose `members.role` is `returning_member`. Because the seat is what authorizes, they
fill their grids normally — the role gate just has to be wide enough to let them load the
page, so it includes `returning_member` and lets the seat check do the real work.

**Consultants never see their ratings.** Not even their own. Candid weekly input is worth
more than a dashboard, and feedback should reach a member from a human — a 1:1, or the
strike system — not by them refreshing a page. This is the one decision to revisit if the
org later wants a transparent development track.

**Weeks are derived, never opened.** `starts_on` is the Monday of Week 1; every week label
falls out of it. Nobody creates a week, and there is no state to forget to advance. Weeks
roll over at midnight **Central**, not UTC — a Sunday-night rating lands in the week the
PM thinks it does.

**No row means unrated.** Defaulting the table to `meets` would make an untouched week
indistinguishable from a considered one, and the reminder job would have nothing to count.

## Speed

The design target was "few clicks, few minutes." What gets it there:

- **Three buttons, not a dropdown.** One click instead of open-scan-select, and the whole
  week is readable at a glance — what the sheet's colour fill was doing informally.
- **"Set the remaining N to Meets."** Most weeks are all Meets with one or two exceptions.
  One click fills every *empty* cell — it can never overwrite a considered rating — and the
  PM overrides the exceptions. This is the difference between 20 seconds and 5 minutes.
- **Autosave.** No submit button to forget; a debounced batch write per burst of clicks.

## Reminders

A Vercel cron hits `/api/accountability/remind` weekly. It emails **only** the PMs/SCs whose
current week is incomplete, with the count outstanding in the subject line, and ledgers each
send in `accountability_reminders` so a retry or a re-run cannot nag twice.

## Phase 2 (not built)

- **Trend view** — a consultant's ratings across weeks and across projects, for exec.
  The data supports it today; the screen doesn't exist.
- **Strike hand-off** — a "file a strike from this" action on a Below rating, prefilling the
  reason from the note.
- **Semester export** — CSV per project for the end-of-semester review packet.
