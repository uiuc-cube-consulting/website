-- Flags are anonymous by default; naming yourself is opt in.
--
-- Run this once against the recruiting database. Until it runs, everything still
-- works: `submitFlag` only sends `attributed` when someone ticked the box, and
-- falls back to filing anonymously if the column is missing. The failure mode of
-- not running this is therefore MORE privacy, never a name published by someone
-- who asked for it to be withheld.
--
-- `submitter_email` is deliberately NOT dropped. Anonymous means "not shown to
-- members" — every flag is still attributable in the database, so an exec chasing
-- an abusive one can find it. That should require deliberately going and looking,
-- which is exactly what querying this table directly is.

alter table public.applicant_flags
  add column if not exists attributed boolean not null default false;

comment on column public.applicant_flags.attributed is
  'The submitter chose to show their name. False (the default) means the flag is shown anonymously; submitter_email is still recorded.';

-- Existing rows keep the default, false: nobody who filed a flag before this
-- existed agreed to be named on it, so none of them are.
