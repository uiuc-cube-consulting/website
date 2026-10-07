// Types and pure helpers for the alumni directory. Shared by the page, the
// client component and the API routes, so nothing here may touch Supabase.

export const CAMPUS_STATUSES = ["on_campus", "off_campus", "unknown"] as const;
export type CampusStatus = (typeof CAMPUS_STATUSES)[number];

export const CAMPUS_LABEL: Record<CampusStatus, string> = {
  on_campus: "On campus",
  off_campus: "Off campus",
  unknown: "Status unknown",
};

export const SOURCES = ["sheet", "linkedin", "sheet+linkedin", "manual"] as const;
export type Source = (typeof SOURCES)[number];

export type Alumnus = {
  id: string;
  full_name: string;
  linkedin_url: string | null;
  headline: string | null;
  company: string | null;
  position: string | null;
  major: string | null;
  email: string | null;
  phone: string | null;
  campus_status: CampusStatus;
  open_to_mentor: boolean;
  source: Source;
  updated_at: string;
};

// ── Fields of study ──────────────────────────────────────────────────────────
// Majors are free text ("CS + Econ", "Finance, Actural Science, Economics |
// Art & Design Minor"), so the filter groups them into a handful of families.
// A double major lands in both families. Order is the chip order.
export const FIELDS = ["Computer Science", "Engineering", "Business", "Data & Information", "Other"] as const;
export type Field = (typeof FIELDS)[number];

const FIELD_PATTERNS: [Exclude<Field, "Other">, RegExp][] = [
  ["Computer Science", /\bcomputer science\b|\bcs\b|\bmath(ematics)? (&|\+) computer/i],
  // "Computer Engineering", "CompE", "ECE", "IE", and every "... Engineering".
  ["Engineering", /engineer|\bcompe\b|\bece\b|\bie\b|\bmeche\b|aerospace/i],
  ["Business", /financ|accountan|accounting|business|marketing|econ|management|supply chain|\bgies\b/i],
  ["Data & Information", /\bdata\b|information|statistic|\bstats\b|analytics/i],
];

export function fieldsOf(major: string | null): Field[] {
  // Minors don't make someone a CS person: "Economics | Minor in Business" is
  // Business because of Economics, not because of the minor.
  const main = (major ?? "").replace(/[|,]?\s*(minor in [^|,]+|[^|,]*\bminor\b)/gi, "");
  if (!main.trim()) return [];
  const hits = FIELD_PATTERNS.filter(([, re]) => re.test(main)).map(([field]) => field);
  return hits.length ? hits : ["Other"];
}

// ── Display ──────────────────────────────────────────────────────────────────

/** One line saying what they do now: the LinkedIn headline wins, being newer. */
export function currentRole(a: Pick<Alumnus, "headline" | "position" | "company">): string | null {
  if (a.headline) return a.headline;
  if (a.position && a.company) return `${a.position} @ ${a.company}`;
  return a.position || a.company || null;
}

/** "2175550142" → "(217) 555-0142". Anything not a 10-digit US number is shown as typed. */
export function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw;
}

// ── Filtering ────────────────────────────────────────────────────────────────

export type SortKey = "name" | "company";
export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "name", label: "Name (A–Z)" },
  { key: "company", label: "Company (A–Z)" },
];

export type FilterOptions = {
  query?: string;
  status?: CampusStatus | "all";
  fields?: Field[];
  company?: string; // exact company, or "" for any
  mentorsOnly?: boolean;
  sort?: SortKey;
};

function haystack(a: Alumnus): string {
  return [a.full_name, a.headline, a.company, a.position, a.major].filter(Boolean).join(" ").toLowerCase();
}

/**
 * Pure filter + sort over the whole directory (a couple hundred rows, so it all
 * runs in the browser). Search tokens match at word starts, the same rule the
 * case-study search uses, so "ai" finds "Scale AI" but not "Daisy".
 */
export function filterAlumni(alumni: Alumnus[], opts: FilterOptions = {}): Alumnus[] {
  const tokens = (opts.query ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => new RegExp(`(^|[^\\p{L}\\p{N}])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "u"));
  const status = opts.status && opts.status !== "all" ? opts.status : null;
  const fields = opts.fields ?? [];
  const company = opts.company?.trim().toLowerCase() ?? "";

  const out = alumni.filter((a) => {
    if (status && a.campus_status !== status) return false;
    if (opts.mentorsOnly && !a.open_to_mentor) return false;
    if (company && (a.company ?? "").toLowerCase() !== company) return false;
    if (fields.length && !fieldsOf(a.major).some((f) => fields.includes(f))) return false;
    if (tokens.length) {
      const hay = haystack(a);
      if (!tokens.every((t) => t.test(hay))) return false;
    }
    return true;
  });

  const byName = (x: Alumnus, y: Alumnus) => x.full_name.localeCompare(y.full_name);
  if (opts.sort === "company") {
    // Alumni with no company on file sink to the bottom instead of leading the list.
    return out.sort((x, y) => {
      if (!x.company !== !y.company) return x.company ? -1 : 1;
      return (x.company ?? "").localeCompare(y.company ?? "") || byName(x, y);
    });
  }
  return out.sort(byName);
}

export type Facets = {
  total: number;
  status: Record<CampusStatus, number>;
  mentors: number;
  fields: { field: Field; count: number }[];
  /** Companies with at least two alumni, most alumni first. */
  companies: { company: string; count: number }[];
};

export function getFacets(alumni: Alumnus[]): Facets {
  const status: Record<CampusStatus, number> = { on_campus: 0, off_campus: 0, unknown: 0 };
  const fieldCounts = new Map<Field, number>();
  const companyCounts = new Map<string, number>();
  let mentors = 0;

  for (const a of alumni) {
    status[a.campus_status] += 1;
    if (a.open_to_mentor) mentors += 1;
    for (const f of fieldsOf(a.major)) fieldCounts.set(f, (fieldCounts.get(f) ?? 0) + 1);
    if (a.company) companyCounts.set(a.company, (companyCounts.get(a.company) ?? 0) + 1);
  }

  return {
    total: alumni.length,
    status,
    mentors,
    fields: FIELDS.filter((f) => fieldCounts.has(f)).map((field) => ({ field, count: fieldCounts.get(field)! })),
    companies: [...companyCounts]
      .filter(([, n]) => n >= 2)
      .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
      .map(([company, count]) => ({ company, count })),
  };
}

// ── Input validation (exec add / edit) ───────────────────────────────────────

export const MAX_TEXT = 200;

export type AlumnusInput = Omit<Alumnus, "id" | "updated_at" | "source">;

/**
 * Accepts `linkedin.com/in/x`, `www.linkedin.com/in/x/?utm=…`, or a full URL,
 * and returns `https://www.linkedin.com/in/x/`. Anything that isn't a profile
 * link on linkedin.com is rejected: the card renders this as a link, so it must
 * not point anywhere else.
 */
export function normalizeLinkedIn(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (!/^(www\.)?linkedin\.com$/i.test(url.hostname)) return null;
  const m = url.pathname.match(/^\/in\/([^/]+)\/?$/);
  return m ? `https://www.linkedin.com/in/${m[1]}/` : null;
}

function text(v: unknown, label: string, errors: string[]): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") {
    errors.push(`${label} must be text.`);
    return null;
  }
  const t = v.trim();
  if (t.length > MAX_TEXT) errors.push(`Keep ${label} under ${MAX_TEXT} characters.`);
  return t || null;
}

/** Validates an exec's add/edit form. Every field is required to be present. */
export function parseAlumnusInput(body: Record<string, unknown>):
  | { ok: true; value: AlumnusInput }
  | { ok: false; error: string } {
  const errors: string[] = [];

  const full_name = text(body.full_name, "name", errors);
  if (!full_name) errors.push("Name is required.");

  const rawUrl = text(body.linkedin_url, "LinkedIn", errors);
  const linkedin_url = rawUrl ? normalizeLinkedIn(rawUrl) : null;
  if (rawUrl && !linkedin_url) errors.push("LinkedIn must be a profile link like linkedin.com/in/name.");

  const email = text(body.email, "email", errors);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("That email doesn't look right.");

  const phone = text(body.phone, "phone", errors);
  if (phone && !/^[\d\s()+.-]{7,}$/.test(phone)) errors.push("Phone can only contain digits, spaces and ()+-.");

  const campus_status = body.campus_status;
  if (!CAMPUS_STATUSES.includes(campus_status as CampusStatus)) {
    errors.push("Pick on campus, off campus or unknown.");
  }

  const value: AlumnusInput = {
    full_name: full_name ?? "",
    linkedin_url,
    headline: text(body.headline, "headline", errors),
    company: text(body.company, "company", errors),
    position: text(body.position, "position", errors),
    major: text(body.major, "major", errors),
    email,
    phone,
    campus_status: campus_status as CampusStatus,
    open_to_mentor: body.open_to_mentor === true,
  };

  return errors.length ? { ok: false, error: errors[0] } : { ok: true, value };
}
