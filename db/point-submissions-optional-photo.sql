-- ─────────────────────────────────────────────────────────────────────────────
-- CUBE portal — point submissions: the photo becomes optional
-- ─────────────────────────────────────────────────────────────────────────────
-- Run in the Supabase SQL editor AFTER db/point-submissions.sql. Idempotent:
-- safe to re-run.
--
-- Members may now submit points without a photo. The form still asks for one
-- ("optional, highly recommended"), and exec see "No photo attached" in the
-- review queue. Until this runs, a submission without a photo is refused with
-- a message telling the member to attach one, so nothing breaks in between.
--
-- The bucket and its rules are unchanged: a photo that IS attached is checked
-- exactly as before.

alter table point_submissions alter column evidence_path drop not null;
alter table point_submissions alter column evidence_mime drop not null;

-- A photo is all or nothing. A path without a type (or a type without a path)
-- would be a bug, so the database refuses it. The existing evidence_mime check
-- already lets NULL through.
alter table point_submissions drop constraint if exists point_submissions_evidence_pair;
alter table point_submissions add constraint point_submissions_evidence_pair
  check ((evidence_path is null) = (evidence_mime is null));
