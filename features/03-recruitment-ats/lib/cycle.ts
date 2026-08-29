// Recruiting cycles — the semester an application belongs to ("fa26", "sp27").
// Pure domain logic, no server imports: safe to use from client components.
//
// Why applications are keyed by (person, cycle) rather than by person
// ───────────────────────────────────────────────────────────────────────────
// People apply to CUBE more than once. Somebody turned down in fa26 comes back
// in sp27, and both attempts are real, separate applications with their own
// essays, their own reviewers and their own scores. Storing one row per email
// would mean the second application either overwrites the first or is rejected
// as a duplicate — and either way the history of who applied when is gone.
//
// So `applicants.cycle` is part of the identity of an application, and the
// uniqueness rule is (lower(email), cycle): apply once per cycle, as many
// cycles as you like. Everything downstream — reviewer assignment, coverage,
// the funnel, decisions — is scoped to one cycle at a time, because mixing two
// cohorts into one dashboard produces numbers that mean nothing.
//
// The canonical form is a two-letter term plus a two-digit year, lowercase:
// `fa26`, `sp27`, `su26`. Short enough to read in a URL and to sort as text
// within a term, but never sort cycles as text across terms — "fa26" < "sp27"
// alphabetically is a coincidence, and "fa26" < "sp26" is simply wrong. Use
// `compareCycles`, which orders by the academic calendar.

export const TERMS = ["sp", "su", "fa"] as const;
export type Term = (typeof TERMS)[number];

/** A canonical cycle key: `${Term}${YY}`, e.g. "fa26". */
export type Cycle = string;

/** Calendar order WITHIN a year. Spring comes first: sp26 → su26 → fa26. */
const TERM_RANK: Record<Term, number> = { sp: 0, su: 1, fa: 2 };

const TERM_LABEL: Record<Term, string> = { sp: "Spring", su: "Summer", fa: "Fall" };

/** The canonical form, and the only thing ever written to the database. */
const CANONICAL = /^(sp|su|fa)(\d{2})$/;

/**
 * What humans actually type. Accepts the canonical form plus the spelled-out
 * term and a four-digit year, with or without a separator: "fa26", "FA26",
 * "Fall 2026", "fall-26", "fa2026".
 *
 * Deliberately does NOT accept a single-letter term. "s26" is ambiguous between
 * spring and summer, and guessing wrong silently files an application against
 * the wrong cohort — the one failure mode that is invisible until decisions are
 * being made off the wrong pool.
 */
const LOOSE = /^(sp(?:ring)?|su(?:mmer)?|fa(?:ll)?)[\s._/-]*((?:19|20)\d{2}|\d{2})$/i;

/** Two-digit years are 21st century: "26" → 2026. */
const CENTURY = 2000;

/**
 * Parse any accepted spelling into its parts, or null if it isn't a cycle.
 *
 * Years outside 2000–2099 return null rather than being clamped: the canonical
 * two-digit form cannot represent them, so accepting one here would produce a
 * key that does not round-trip.
 */
export function parseCycle(input: string | null | undefined): { term: Term; year: number } | null {
  if (!input) return null;
  const m = LOOSE.exec(String(input).trim());
  if (!m) return null;

  const term = m[1].slice(0, 2).toLowerCase() as Term;
  const digits = m[2];
  const year = digits.length === 4 ? Number(digits) : CENTURY + Number(digits);
  if (year < CENTURY || year > CENTURY + 99) return null;

  return { term, year };
}

/**
 * The canonical key for any accepted spelling, or null if it isn't a cycle.
 * Everything that reaches the database goes through here first, so the column
 * only ever holds one spelling of a given semester.
 */
export function normalizeCycle(input: string | null | undefined): Cycle | null {
  const parsed = parseCycle(input);
  if (!parsed) return null;
  return `${parsed.term}${String(parsed.year - CENTURY).padStart(2, "0")}`;
}

/** True when `input` names a cycle in any accepted spelling. */
export function isCycle(input: string | null | undefined): boolean {
  return normalizeCycle(input) !== null;
}

/** True only for the canonical stored form — what the CHECK constraint enforces. */
export function isCanonicalCycle(input: string | null | undefined): boolean {
  return typeof input === "string" && CANONICAL.test(input);
}

/** Human label for a cycle: "fa26" → "Fall 2026". Unparseable input is returned
 *  unchanged, so a stray value renders as itself rather than as "Invalid". */
export function cycleLabel(cycle: string | null | undefined): string {
  const parsed = parseCycle(cycle);
  if (!parsed) return String(cycle ?? "");
  return `${TERM_LABEL[parsed.term]} ${parsed.year}`;
}

/**
 * Sortable integer for a cycle, ascending in calendar order. Unparseable input
 * sorts before every real cycle rather than throwing, so a bad row cannot break
 * a whole listing.
 */
export function cycleSortKey(cycle: string | null | undefined): number {
  const parsed = parseCycle(cycle);
  if (!parsed) return -1;
  return parsed.year * 10 + TERM_RANK[parsed.term];
}

/** Chronological comparator: older cycle first. Use with `.sort()`. */
export function compareCycles(a: string, b: string): number {
  return cycleSortKey(a) - cycleSortKey(b);
}

/** Cycles in calendar order, deduped and canonicalised. Newest first by default,
 *  which is what every dropdown in the portal wants. */
export function sortCycles(cycles: (string | null | undefined)[], order: "desc" | "asc" = "desc"): Cycle[] {
  const canonical = [...new Set(cycles.map(normalizeCycle).filter((c): c is Cycle => c !== null))];
  canonical.sort(compareCycles);
  return order === "desc" ? canonical.reverse() : canonical;
}

/**
 * The cycle a date falls in: Jan–May spring, Jun–Jul summer, Aug–Dec fall.
 *
 * This is the fallback used when nobody has set an active cycle yet, and it is
 * the same split db/cycles.sql uses to backfill rows written before the column
 * existed. Keep the two in step — if this changes, the migration's CASE must
 * change with it, or a backfilled row and a freshly-written one disagree about
 * which cohort the same week belongs to.
 */
export function cycleForDate(date: Date = new Date()): Cycle {
  const month = date.getMonth() + 1; // getMonth() is 0-indexed
  const term: Term = month <= 5 ? "sp" : month <= 7 ? "su" : "fa";
  return `${term}${String(date.getFullYear() - CENTURY).padStart(2, "0")}`;
}

/**
 * The next cycle CUBE recruits in. Fall rolls to the following spring; spring
 * and summer both roll to that year's fall.
 *
 * Summer is skipped on purpose — it is representable (a cycle imported from an
 * odd year, or a summer analytics cohort) but nobody runs recruitment through
 * it, so offering "su27" as the next cycle to open would be noise.
 */
export function nextRecruitingCycle(cycle: string): Cycle | null {
  const parsed = parseCycle(cycle);
  if (!parsed) return null;
  const { term, year } = parsed;
  return term === "fa" ? `sp${String(year + 1 - CENTURY).padStart(2, "0")}` : `fa${String(year - CENTURY).padStart(2, "0")}`;
}

/**
 * Narrow any set of cycle-stamped rows to one cycle.
 *
 * Comparison is on the canonical form of both sides rather than raw strings, so
 * a row written before normalisation was enforced still matches the cycle it
 * belongs to. Rows with no cycle at all are excluded: an un-stamped row belongs
 * to no cohort, and including it in every cohort would double-count it.
 */
export function inCycle<T extends { cycle?: string | null }>(rows: T[], cycle: string | null | undefined): T[] {
  const want = normalizeCycle(cycle);
  if (!want) return rows;
  return rows.filter((r) => normalizeCycle(r.cycle) === want);
}

/** Every distinct cycle present in a set of rows, newest first. */
export function cyclesPresent(rows: { cycle?: string | null }[]): Cycle[] {
  return sortCycles(rows.map((r) => r.cycle));
}
