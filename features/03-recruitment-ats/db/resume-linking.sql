-- Remember which sheet a cycle's applications came from.
-- Additive; run any time after db/visibility.sql. Safe to re-run.
--
-- Why this is stored rather than passed in
-- ─────────────────────────────────────────────────────────────────────────────
-- "Link missing resumes" is open to every member, not just exec, because any
-- reviewer who opens a candidate and finds no resume should be able to fix it
-- rather than wait for an officer. That only works if the endpoint decides which
-- sheet to read.
--
-- If the sheet id came from the request body, a member could point the service
-- account at any spreadsheet id they liked and learn from the response whether
-- it was readable — turning an internal maintenance action into a probe for
-- which documents our Google service account can see. Storing it here removes
-- the parameter entirely: there is one sheet per cycle, exec sets it, and the
-- endpoint has no input to abuse.
--
-- The import route keeps accepting an explicit sheet, because that one is
-- exec-only and pasting a URL is how a cycle starts.

alter table recruiting_settings add column if not exists import_sheet_id text;

-- Bare ids only. A pasted URL would still "work" for `spreadsheets.values.get`
-- in some shapes and fail confusingly in others, so it is normalised on write
-- (lib/visibility.ts) and constrained here to what Drive actually uses.
alter table recruiting_settings drop constraint if exists recruiting_settings_import_sheet_id_check;
alter table recruiting_settings add constraint recruiting_settings_import_sheet_id_check
  check (import_sheet_id is null or import_sheet_id ~ '^[a-zA-Z0-9_-]{10,}$');
