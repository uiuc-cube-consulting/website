-- ─────────────────────────────────────────────────────────────────────────────
-- CUBE portal — point submissions (member-submitted, exec-reviewed)
-- ─────────────────────────────────────────────────────────────────────────────
-- Run in the Supabase SQL editor AFTER db/schema.sql, db/points.sql and
-- db/point-categories.sql (this references `members` and
-- `point_entries.category`). Idempotent: safe to re-run.
--
-- Members submit an event from the Point Breakdowns sheet (lib/point-catalog.ts)
-- with a photo as evidence. Nothing counts until exec approve it; approval then
-- appends a normal row to `point_entries` in the event's category, so the
-- standings board, totals and breakdowns all keep working exactly as they do
-- for points exec award by hand.
--
-- ── Why submissions are a separate table and not pending point_entries ──────
-- The ledger's promise is that every row in it counts. Mixing in rows that are
-- waiting, or were turned down, would put a status filter in front of every
-- total. A submission is a REQUEST; the ledger entry is the award it produced,
-- linked back through `point_entry_id`.

create extension if not exists "pgcrypto";  -- gen_random_uuid()

create table if not exists point_submissions (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  member_id       uuid not null references members(id) on delete cascade,

  -- Category, label and points are COPIED from the catalog at submission time
  -- rather than looked up from `event_key` later. If the sheet changes mid-
  -- semester (an event renamed, a value bumped), what a member submitted and
  -- what exec approved still reads the way it did at the time.
  category        text not null check (category in ('fundamentals', 'professional', 'social')),
  event_key       text not null check (length(trim(event_key)) > 0),
  event_label     text not null check (length(trim(event_label)) > 0),
  points          integer not null check (points between 1 and 10),
  occurred_on     date not null,
  note            text check (note is null or length(note) <= 500),

  -- Object key in the private `point-evidence` bucket. NOT NULL: the photo is
  -- uploaded before the row is inserted, so a submission without one can't exist.
  evidence_path   text not null,
  evidence_mime   text not null check (evidence_mime in ('image/png', 'image/jpeg', 'image/webp')),

  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by     uuid references members(id) on delete set null,
  reviewed_at     timestamptz,
  review_note     text check (review_note is null or length(review_note) <= 500),
  -- The ledger row an approval created. `set null` so correcting the ledger by
  -- hand never deletes the record that someone asked for the points.
  point_entry_id  uuid references point_entries(id) on delete set null
);

create index if not exists point_submissions_member_idx on point_submissions (member_id, created_at desc);
create index if not exists point_submissions_status_idx on point_submissions (status, created_at desc);

-- ── RLS: deny anon by default; the server service role bypasses RLS ──────────
alter table point_submissions enable row level security;
-- (No policies. Submitting goes through POST /api/points/submissions, which is
--  the four member roles; reviewing through /api/points/submissions/[id]/review,
--  which is exec-only. Both check the session themselves.)

-- ── Review, atomically ───────────────────────────────────────────────────────
-- Approving is two writes — the ledger entry and the submission's status — and
-- they must land together. Done as two API calls, a failure between them either
-- awards points for a submission still shown as pending (so it can be approved
-- twice), or marks it approved with no points behind it. The row lock also
-- makes two exec clicking Approve at the same moment award it once.
--
-- Returns the outcome as text rather than raising, so the route can tell the
-- reviewer "someone already reviewed this" instead of reporting a 500:
--   'approved' | 'rejected' | 'not_found' | 'already_approved' | 'already_rejected'
create or replace function review_point_submission(
  p_id        uuid,
  p_reviewer  uuid,
  p_decision  text,
  p_note      text,
  p_reason    text
) returns text
language plpgsql
as $$
declare
  current_status text;
  target_member  uuid;
  award          integer;
  award_category text;
  entry_id       uuid;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception 'p_decision must be approved or rejected, got %', p_decision;
  end if;

  select status, member_id, points, category
    into current_status, target_member, award, award_category
    from point_submissions
   where id = p_id
     for update;

  if not found then
    return 'not_found';
  end if;
  if current_status <> 'pending' then
    return 'already_' || current_status;
  end if;

  if p_decision = 'approved' then
    -- Lands in the submission's category, so an approved resume review counts
    -- toward the member's professional total.
    insert into point_entries (member_id, delta, reason, awarded_by, category)
    values (target_member, award, p_reason, p_reviewer, award_category)
    returning id into entry_id;
  end if;

  update point_submissions
     set status         = p_decision,
         reviewed_by    = p_reviewer,
         reviewed_at    = now(),
         review_note    = nullif(trim(p_note), ''),
         point_entry_id = entry_id
   where id = p_id;

  return p_decision;
end;
$$;

-- Functions in `public` are callable through PostgREST by default, and the anon
-- key ships to every browser. Without this, anyone could call the RPC directly
-- and approve their own points. Only the server's service role may run it.
revoke all on function review_point_submission(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function review_point_submission(uuid, uuid, text, text, text) to service_role;

-- ── Evidence storage ─────────────────────────────────────────────────────────
-- PRIVATE. These are photos of members, often with other people in them. The
-- only way to see one is GET /api/points/submissions/[id]/evidence, which serves
-- the submitter and exec and nobody else. The size and type limits repeat the
-- route's own checks (lib/point-evidence.ts) at the storage layer.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('point-evidence', 'point-evidence', false, 3145728, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- No storage policies on purpose: uploads and downloads run with the service
-- role, and any policy for anon/authenticated would only widen access.

-- ── Verify ───────────────────────────────────────────────────────────────────
--   select status, count(*) from point_submissions group by status;
--
--   -- Every approval produced exactly one ledger entry, in the right category:
--   select count(*) from point_submissions s
--   left join point_entries p on p.id = s.point_entry_id
--   where s.status = 'approved'
--     and (p.id is null or p.category is distinct from s.category);   -- expect 0
