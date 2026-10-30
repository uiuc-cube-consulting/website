# CUBE network: members, exec, alumni and mentoring

Extends the existing `/portal/alumni` directory; old links still work. The nav
now says **CUBE Network**. This builds on the member-profile feature (PR #75).

## Setup and privacy

Apply the base member schema, alumni schema, member-matching schema, then
`features/09-cube-network/db/schema.sql`. This adds consent flags (all **false**
by default) and a source-review table. It does not seed or edit real people.

Every live roster member/exec appears by name and CUBE role automatically,
without copying them into `alumni`. Their major, skills, interests and LinkedIn
are shared only after **My Profile → Share my directory profile** is enabled.
Email has a separate opt-in. Mentoring availability is an explicit choice;
neither education nor mentoring willingness is inferred from membership.
Turning off profile sharing hides all these optional fields again.

Bio, learning goals and project preferences are **never** in directory
responses. No extra phone numbers or personal emails are researched/enriched.
Existing alumni contacts remain signed-in-only, as before.

Only exact LinkedIn or email matches suppress duplicate alumni/current-member
entries; namesakes are not merged. Legacy alumni remain editable by exec;
current members maintain their shared fields through My Profile.

## Keeping it current

Members see a confirmation date when they save shared profile details. Alumni
show the record edit date and a stale-details warning after 180 days. This
date does **not** prove a current employer, enrollment or degree.

Exec can filter **Needs source review** and use **Review sources** on a card:
check the same-person LinkedIn match, look for explicit Urbana-Champaign
education evidence, record a LinkedIn/illinois.edu source and private notes.
The source-review date is separate from profile confirmation. A changed
LinkedIn link invalidates the prior review. Unshared member links cannot leak
through a review source. Reviews are denied to non-exec; API writes recheck
the live roster rather than trusting an old JWT role.

Unknown, conflicting and stale evidence stays visibly flagged. “Evidence
reviewed” is **not formal credential verification**. Do not bulk mark records
verified from a CUBE membership list, university-email domain or snippets.

## Access limitations and research

The live alumni inventory is not in this public repository. A separate private
research deliverable cross-checks 72 recoverable Fall 2026 roster names against
public indexed evidence, with ambiguities preserved. It has not been imported,
and no live directory record is claimed verified by this PR.

No Google OAuth, live Supabase migration, production deploy, message sending
or outreach was performed. Missing partial data sources are displayed as
warnings, not as a seemingly complete empty directory.
