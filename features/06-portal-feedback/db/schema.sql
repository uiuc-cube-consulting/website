-- Portal feedback widget (feature 06).
-- Run once in the Supabase SQL editor, after db/schema.sql. Safe to re-run.
--
-- Every member gets a floating "Send feedback" button inside /portal. They
-- capture the screen, write a line about what is wrong or what they want, and
-- the portal opens a GitHub issue signed with their name and email.
--
-- This table is NOT the artifact anyone works from — the GitHub issue is. It
-- exists for two narrower reasons:
--   1. a screenshot needs an id to be addressed by, and
--   2. the hourly rate limit needs something to count.
-- Losing it would cost history, not the feature: the route deliberately still
-- files the issue when these statements have not been run yet.

create table if not exists portal_feedback (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),

  -- Who filed it. The email is stored ALONGSIDE the member id rather than
  -- joined out of it on read, because the report has to keep naming its author
  -- after they graduate and their row is gone — which is also why the FK is
  -- `set null` rather than `cascade`.
  member_id       uuid references members(id) on delete set null,
  member_email    text not null,
  member_name     text,
  member_role     text,

  kind            text not null check (kind in ('bug', 'idea')),
  description     text not null,

  -- Where they were standing when they hit the button. This is the single most
  -- useful field for reproducing a report and the one a member would never
  -- think to type out.
  page_path       text not null,
  viewport        text,

  -- Object key in the private `feedback-screenshots` bucket, plus the mime we
  -- validated on the way in. Null when they sent a note without a picture, and
  -- also when the upload failed — the issue is filed either way.
  screenshot_path text,
  screenshot_mime text,

  -- Backfilled after GitHub answers. Null means the issue was never created
  -- (bad token, GitHub down), which makes these rows the recovery list.
  issue_number    integer,
  issue_url       text
);

-- The rate-limit query: this member's rows in the last hour.
create index if not exists portal_feedback_member_recent_idx
  on portal_feedback (member_email, created_at desc);

-- Reads go through the service-role key in the API routes, which bypasses RLS.
-- RLS is still enabled so that the anon key — which ships to every browser in
-- NEXT_PUBLIC_SUPABASE_ANON_KEY — cannot read the table directly. With RLS on
-- and no policy granted to anon, that key sees nothing at all, which is the
-- intent: feedback is read through /api/feedback/*, or not at all.
alter table portal_feedback enable row level security;

-- ── Screenshot storage ───────────────────────────────────────────────────────
-- A PRIVATE bucket. The screenshots are pictures of whatever the member had on
-- screen, which on these pages means strikes, accountability ratings, or an
-- applicant's file — and the GitHub issue linking to them is public. `public`
-- must stay false; the API route is what decides who may look.
insert into storage.buckets (id, name, public)
values ('feedback-screenshots', 'feedback-screenshots', false)
on conflict (id) do nothing;

-- No storage policies are created on purpose. Uploads and downloads both run
-- with the service-role key from the server, which bypasses them; adding a
-- policy for anon or authenticated here would only widen access beyond the
-- route's own check (submitter or exec).
