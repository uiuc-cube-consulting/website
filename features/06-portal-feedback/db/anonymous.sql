-- Anonymous portal feedback (feature 06).
-- Run once in the Supabase SQL editor, after db/schema.sql. Safe to re-run.
--
-- The widget can file a report WITHOUT the member's name or email on the GitHub
-- issue. This column records that choice; it does not implement it. The issue
-- body is written from the request in app/api/feedback/route.ts, so a
-- deployment that has not run this file still files anonymous reports correctly
-- — it simply does not remember afterwards which ones they were. (The insert
-- retries without the column, so a missing migration is not an error either.)
--
-- What "anonymous" means here, precisely:
--   * the PUBLIC issue carries no name, no email, and no role;
--   * this table still does, and so does the hourly rate limit, which counts by
--     member_email. Anonymity from the internet is the promise being made, not
--     anonymity from an exec with Supabase access chasing an abusive report.
-- Same arrangement as applicant_flags.attributed (03-recruitment-ats), for the
-- same reason: an unaccountable write path into a public tracker is a spam
-- cannon, and a promise nobody can audit is worth less than a narrow one that
-- holds.
--
-- Default false so every pre-existing row reads as what it was: signed.

alter table portal_feedback
  add column if not exists anonymous boolean not null default false;

comment on column portal_feedback.anonymous is
  'Filed with the reporter withheld from the public GitHub issue. The row still names them.';
