-- Final-round Drive folders — additive migration on top of db/drive-folders.sql.
-- Run AFTER schema.sql, interview.sql, rounds.sql and drive-folders.sql, once,
-- in the Supabase SQL editor. Safe to re-run.
--
-- Context: the first round already gives every candidate a Drive folder holding
-- their resume and an editable copy of each interview rubric. The final round
-- needs the same thing and cannot reuse it, for two reasons:
--
--   1. It is a different rubric. The final round is scored on the second-round
--      rubric (process, communication, presentation, competency, teamwork,
--      pitch, plus a room score), which the first-round folder knows nothing of.
--   2. It is a different audience. Final-round folders live under their own
--      top-level folder in the shared drive, so exec can share that ONE folder
--      with the final-round panel without handing over the whole first-round
--      tree — the round's Supabase-side visibility rule (lib/rounds.ts) has an
--      equivalent in Drive instead of an exception to it.
--
-- So a candidate in the final round has TWO folders, and the ledger has to be
-- able to say which is which.

-- ── 1. Final-round folder pointer on the applicant ───────────────────────────
-- Deliberately separate columns rather than overwriting drive_folder_id: a
-- candidate who reaches the final round still has a first round worth opening,
-- and the board picks the column that matches the round being viewed.
alter table applicants add column if not exists final_drive_folder_id      text;
alter table applicants add column if not exists final_drive_folder_url     text;
alter table applicants add column if not exists final_drive_provisioned_at timestamptz;

create index if not exists applicants_final_drive_folder_idx
  on applicants (final_drive_folder_id);

-- ── 2. Ledger vocabulary ─────────────────────────────────────────────────────
-- candidate_drive_assets is keyed (applicant_id, kind), so the final round's
-- artifacts need kinds of their own — 'folder' and 'case_rubric' are already
-- taken by the first round for the same applicant. Mirrors ASSET_KINDS in
-- lib/provision-store.ts.
alter table candidate_drive_assets drop constraint if exists candidate_drive_assets_kind_check;
alter table candidate_drive_assets add constraint candidate_drive_assets_kind_check
  check (kind in (
    'folder', 'resume', 'case_rubric', 'behavioral_rubric', 'notes',
    'final_folder', 'final_rubric'
  ));
