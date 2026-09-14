-- ─────────────────────────────────────────────────────────────────────────────
-- CUBE portal — point categories
-- ─────────────────────────────────────────────────────────────────────────────
-- Run in the Supabase SQL editor AFTER db/points.sql and BEFORE
-- db/point-submissions.sql. Idempotent: safe to re-run.
--
-- Every award now belongs to one of the three categories on the Point
-- Breakdowns sheet (lib/point-catalog.ts), so each member's total breaks down
-- into fundamentals, professional and social, and exec can score each one.
--
-- ── Why the column is nullable ───────────────────────────────────────────────
-- The API requires a category on every new award (validateAward in
-- lib/points.ts), so in practice every row has one. The database doesn't
-- enforce it, because this file is run by hand and the deployed code may be
-- older or newer than it. NOT NULL would make the older code's awards fail the
-- moment this runs. A null category means "recorded before categories existed".
-- The ledger had no rows when this was written (2026-09-13), so there should be none.

alter table point_entries add column if not exists category text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'point_entries_category_check') then
    alter table point_entries
      add constraint point_entries_category_check
      check (category is null or category in ('fundamentals', 'professional', 'social'));
  end if;
end $$;

-- The per-member breakdown sums by member and category.
create index if not exists point_entries_member_category_idx on point_entries (member_id, category);

-- ── Verify ───────────────────────────────────────────────────────────────────
-- Each member's breakdown, the same shape the API builds:
--
--   select m.full_name,
--          coalesce(sum(p.delta) filter (where p.category = 'fundamentals'), 0) as fundamentals,
--          coalesce(sum(p.delta) filter (where p.category = 'professional'), 0) as professional,
--          coalesce(sum(p.delta) filter (where p.category = 'social'), 0)       as social,
--          coalesce(sum(p.delta), 0)                                            as total
--   from members m
--   left join point_entries p on p.member_id = m.id
--   where m.role <> 'exec'
--   group by m.id, m.full_name
--   order by total desc, m.full_name;
--
-- Entries with no category (expect 0):
--   select count(*) from point_entries where category is null;
