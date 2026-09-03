-- Flag removal — additive migration on top of features/03-recruitment-ats/db/flags.sql.
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- flags.sql called the table append-only, "no edit/delete surface". That was the
-- right default and it is what this migration keeps: a removed flag is HIDDEN,
-- never deleted. The row stays, with who removed it and when.
--
-- Why soft rather than hard: a red flag is a reputational record, and the two
-- reasons to take one down pull in opposite directions. Most are honest —
-- flagged the wrong person, duplicate submission, the concern was resolved. The
-- rest are not, and the only defence against an exec quietly erasing a concern
-- about a friend is that the erasure itself is on the record. A DELETE leaves
-- nothing to find; this leaves a row that says who did it.
--
-- Nothing in the app ever un-removes a flag: restoring one is a deliberate trip
-- to the SQL editor (`update applicant_flags set removed_at = null where id = …`),
-- which is the correct amount of friction for putting a concern back on someone's
-- profile.

alter table applicant_flags add column if not exists removed_at     timestamptz;
alter table applicant_flags add column if not exists removed_by     text;
alter table applicant_flags add column if not exists removed_reason text;

-- Every read filters on `removed_at is null`, and on a live table that is most of
-- the rows, so the index carries the predicate rather than the column.
create index if not exists applicant_flags_live_idx
  on applicant_flags (applicant_id) where removed_at is null;

-- The pending-pool lookup, which is the same query narrowed to unclaimed flags.
create index if not exists applicant_flags_pending_live_idx
  on applicant_flags (subject_email) where applicant_id is null and removed_at is null;

-- `removed_by` is a member's email rather than a member id, matching
-- `submitter_email` on the same table: flags are keyed by email throughout, and a
-- removal must still be attributable if that person later leaves the roster.
do $$
begin
  alter table applicant_flags add constraint applicant_flags_removal_complete
    check ((removed_at is null and removed_by is null)
        or (removed_at is not null and removed_by is not null));
exception when duplicate_object then null;
end $$;

comment on column public.applicant_flags.removed_at is
  'Set when a flag is taken down. Non-null hides it from every surface; the row is kept.';
comment on column public.applicant_flags.removed_by is
  'Email of the exec, or the original submitter, who removed it. Required whenever removed_at is set.';
comment on column public.applicant_flags.removed_reason is
  'Optional free text from whoever removed it. Never shown to members; for an exec reading the table.';
