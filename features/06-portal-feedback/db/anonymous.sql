-- Anonymous notes to exec (feature 06).
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Note the thing that is NOT here: a table of notes. What a member writes on
-- /portal/anonymous is emailed to the exec addresses and kept nowhere else. A
-- database copy of an anonymous report is one more place it can be read from,
-- one more thing to leak, and — sitting next to a members table in the same
-- project — one more join somebody will eventually be tempted to try.
--
-- This table exists only to stop the form being used to flood two inboxes, and
-- it is shaped so that it cannot double as a record of who said what:
--
--   * sender_hash is an HMAC of the member's address under a secret held in the
--     ENVIRONMENT (ANONYMOUS_REPORT_SALT, falling back to AUTH_SECRET). Not a
--     bare SHA-256: a plain digest of an @illinois.edu address is reversible by
--     anyone willing to hash sixty names, which in a club this size is not a
--     hash at all. Without the secret this table is opaque.
--
--   * window_start is truncated to the HOUR, and no exact timestamp is stored
--     anywhere. An hour is all a quota needs, and it is deliberately too coarse
--     to line up against the arrival time of a particular email.
--
--   * there is no note id, no topic, and no foreign key to anything. Nothing in
--     this row can be joined to a message, because the message is not in the
--     database to be joined to.
--
-- The limit of all that, stated plainly because the form states it too: someone
-- holding BOTH this table and the server's secret can learn that some account
-- sent something in some hour. They cannot learn what. That person is whoever
-- deploys the site.
--
-- Rows age out of usefulness after an hour; see the cleanup at the bottom.

create table if not exists anonymous_report_quota (
  sender_hash  text        not null,
  window_start timestamptz not null,
  sent         integer     not null default 0,
  primary key (sender_hash, window_start)
);

-- Reads go through the service-role key in the API route, which bypasses RLS.
-- RLS is still enabled so the anon key — which ships to every browser in
-- NEXT_PUBLIC_SUPABASE_ANON_KEY — cannot read this table directly. With RLS on
-- and no policy granted to anon, that key sees nothing at all.
alter table anonymous_report_quota enable row level security;

-- Housekeeping. Nothing depends on this running: the quota only ever reads the
-- current hour, so stale rows are inert rather than wrong. Deleting them is
-- simply the polite thing to do with data that has stopped having a purpose —
-- run it whenever, or wire it to a cron.
delete from anonymous_report_quota where window_start < now() - interval '2 hours';
