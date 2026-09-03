-- Applicant flags — additive migration on top of db/schema.sql.
-- Run AFTER schema.sql, once, in the Supabase SQL editor. Safe to re-run.
--
-- Any signed-in member can flag a person red (concern) or green (endorsement)
-- with a required note. Append-only in the sense that matters: a flag is never
-- edited, and `db/flag-removal.sql` added taking one down as a HIDE (removed_at)
-- rather than a delete, so the row and its author survive the removal.
--
-- A flag is about a PERSON, keyed by email — not about an application row. That
-- is the whole point: members flag people at info nights, coffee chats and
-- callouts, often weeks before the application even opens. Such a flag is stored
-- PENDING (applicant_id null) and is claimed automatically the moment an
-- application arrives from a matching email, carrying its original author, note,
-- event and timestamp onto the applicant's profile.

create table if not exists applicant_flags (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  applicant_id   uuid references applicants(id) on delete cascade,
  submitter_email text not null,
  color          text not null check (color in ('red', 'green')),
  description    text not null
);

-- ── Pending-flag columns (added by this migration) ───────────────────────────
-- subject_email is the match key and the only identifier a pending flag has, so
-- it is stored on EVERY row — including flags filed directly on an applicant, so
-- the two kinds stay queryable the same way.
alter table applicant_flags add column if not exists subject_email text;
alter table applicant_flags add column if not exists subject_name  text;
alter table applicant_flags add column if not exists event         text;
alter table applicant_flags add column if not exists linked_at     timestamptz;

-- Backfill rows written before this migration: their subject is whoever the
-- applicant row says, and they were linked at creation.
update applicant_flags f
   set subject_email = lower(a.email)
  from applicants a
 where f.applicant_id = a.id
   and f.subject_email is null;
update applicant_flags
   set linked_at = created_at
 where applicant_id is not null
   and linked_at is null;

-- Drop any orphans left over from a partial backfill (an applicant deleted
-- before this ran) so the not-null below cannot fail on unrecoverable rows.
delete from applicant_flags where subject_email is null and applicant_id is null;

alter table applicant_flags alter column applicant_id drop not null;
alter table applicant_flags alter column subject_email set not null;

-- Emails are matched case-insensitively; store them already lowered so the
-- claim query is a plain equality and can use the index below.
update applicant_flags set subject_email = lower(subject_email)
 where subject_email <> lower(subject_email);

do $$
begin
  alter table applicant_flags add constraint applicant_flags_subject_email_lower
    check (subject_email = lower(subject_email) and subject_email <> '');
exception when duplicate_object then null;
end $$;

-- A pending flag outlives the application row it eventually attaches to: if an
-- applicant is deleted (bad import, between-cycle cleanup) the observation from
-- the event is still true, so the flag reverts to pending rather than being
-- destroyed with the row. Replaces the original ON DELETE CASCADE.
do $$
declare fk text;
begin
  select conname into fk
    from pg_constraint
   where conrelid = 'applicant_flags'::regclass
     and contype = 'f'
     and confrelid = 'applicants'::regclass;
  if fk is not null then
    execute format('alter table applicant_flags drop constraint %I', fk);
  end if;
  alter table applicant_flags
    add constraint applicant_flags_applicant_id_fkey
    foreign key (applicant_id) references applicants(id) on delete set null;
end $$;

create index if not exists applicant_flags_applicant_idx on applicant_flags (applicant_id);
-- The claim lookup: every pending flag for one email, run on each new applicant.
create index if not exists applicant_flags_pending_idx
  on applicant_flags (subject_email) where applicant_id is null;

alter table applicant_flags enable row level security;
-- Same posture as the rest of the ATS: deny-by-default for anon, service role
-- (server-only) bypasses. All access goes through the API, which enforces NextAuth.
