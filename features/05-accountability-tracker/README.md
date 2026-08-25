# 05 · Accountability tracker

Weekly consultant QA ratings in the member portal — the replacement for the per-project
Google Sheet of Meets / Exceeds / Below dropdowns.

- **PM / SC** open `/portal/accountability` and rate each consultant on their project across
  three categories. One click per cell, autosaved, no submit button. "Set the remaining N to
  Meets" fills the blanks so only the exceptions need thought.
- **Exec** get every project on one board: completion per week, weeks that were never
  finished, and every *Below* rating with its note.
- A **weekly cron** emails only the leads with an unfinished week, once.

| Doc | |
|---|---|
| [SPEC.md](./SPEC.md) | The problem, the model, and why each decision went the way it did. |
| [INTEGRATION.md](./INTEGRATION.md) | Setup, files outside this folder, permissions, verification. |

```
lib/week.ts     semester week math (pure — weeks are derived, never opened)
lib/access.ts   who may read/write which project (pure predicates)
lib/types.ts    categories, ratings, completion
lib/store.ts    Supabase access + demo fallback (server only)
lib/email.ts    the weekly reminder template
```
