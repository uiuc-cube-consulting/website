-- Three-round recruiting — additive migration on top of db/interview.sql.
-- Run AFTER schema.sql and interview.sql, once, in the Supabase SQL editor.
-- Safe to re-run.
--
-- The cycle is now explicitly three rounds (lib/rounds.ts):
--   written      applied | screened   — essays + resume, point rubric
--   first_round  interview            — case + behavioral, Drive folders
--   final_round  final_round          — EXEC ONLY
--
-- Two things had to change in the database for that to hold:
--   1. reviews.kind gains the two final-round rubrics, so a final-round score is
--      a distinct row rather than an overwrite of the first-round one.
--   2. interview_panel gains `round`, so a candidate can have a first-round panel
--      and a different final-round panel at the same time.

-- ── 1. The 'final_round' stage ───────────────────────────────────────────────
-- applicants.stage is free text with no CHECK (see db/schema.sql), so the new
-- value needs no DDL. Recorded here so the vocabulary stays documented in one
-- place, in funnel order:
--   applied -> screened -> interview -> final_round -> offer -> accepted
--   rejected | withdrawn  (terminal, reachable from anywhere)

-- ── 2. Final-round review kinds ──────────────────────────────────────────────
-- 'screen'                          the written application (lib/types.ts RUBRIC)
-- 'case' | 'behavioral'             first-round interviews  (lib/interview.ts)
-- 'final_case' | 'final_behavioral' final-round interviews, exec-only
--
-- The first and final rounds run the same two rubric templates but store them
-- under separate kinds. The uniqueness key below is (applicant, reviewer, kind),
-- so an exec who interviews the same candidate in both rounds would otherwise
-- overwrite their own first-round rubric — losing the earlier score exactly when
-- the two are worth comparing.
alter table reviews drop constraint if exists reviews_kind_check;
alter table reviews add constraint reviews_kind_check
  check (kind in ('screen', 'case', 'behavioral', 'final_case', 'final_behavioral'));

-- ── 3. Per-round interview panels ────────────────────────────────────────────
-- Existing rows all predate the final round, so they are first-round panels.
alter table interview_panel add column if not exists round text not null default 'first_round';

alter table interview_panel drop constraint if exists interview_panel_round_check;
alter table interview_panel add constraint interview_panel_round_check
  check (round in ('first_round', 'final_round'));

-- Widen the primary key from (applicant, interviewer) to (applicant, interviewer,
-- round). Without this, putting an exec on a candidate's final-round panel would
-- collide with their first-round row and the insert would fail.
do $$
declare pk text;
begin
  select conname into pk
    from pg_constraint
   where conrelid = 'interview_panel'::regclass
     and contype = 'p';
  -- Already widened by a previous run of this file? Then leave it alone.
  if pk is not null and pk <> 'interview_panel_round_pkey' then
    execute format('alter table interview_panel drop constraint %I', pk);
  end if;
exception when undefined_table then null;
end $$;

do $$
begin
  alter table interview_panel
    add constraint interview_panel_round_pkey
    primary key (applicant_id, interviewer_email, round);
exception
  when duplicate_table then null;   -- constraint already present
  when duplicate_object then null;
  when invalid_table_definition then null;
end $$;

-- The console's two hot lookups: one round's whole board, and "what am I on?".
create index if not exists interview_panel_round_idx on interview_panel (round);
create index if not exists interview_panel_interviewer_round_idx
  on interview_panel (lower(interviewer_email), round);

-- ── 4. Written reviews scored under the OLD rubric ───────────────────────────
-- The written rubric changed from four 1–5 criteria (problem_solving,
-- communication, drive, fit — a weighted mean out of 5) to six point-scored
-- criteria out of 28 (essay_1 5, essay_2 3, essay_3 3, case_essay 7, misc 5,
-- resume 5). reviews.weighted_total keeps its column name and now holds POINTS
-- for screen rows.
--
-- Old rows are not migrated, because there is no honest mapping: a 4/5 on
-- "problem-solving" does not convert into an essay-by-essay point split. They are
-- left in place and simply score 0 under the new rubric (lib/types.ts recomputes
-- totals from `scores` rather than trusting the stored column, so they cannot
-- quietly inflate anyone's mean).
--
-- If you are starting a fresh cycle and want them gone, run this deliberately —
-- it is destructive and therefore NOT executed by this migration:
--
--   delete from reviews
--    where kind = 'screen'
--      and not (scores ? 'essay_1');
--
-- Check what it would remove first:
--   select count(*) from reviews where kind = 'screen' and not (scores ? 'essay_1');
