// Pure filename -> applicant matching. No I/O, no imports — testable in isolation
// and safe to import anywhere.
//
// The job: someone drops ~200 resumes in a Drive folder, named however the
// applicants happened to name them ("Doe_Jane_Resume.pdf", "jdoe2 CV final.pdf",
// "Resume - Jane Doe (1).pdf"). We link each to the right applicant with no human
// in the loop, and we are honest about the ones we can't.
//
// Cost: one pass to index applicants, one pass over files, all lookups hashed.
// The fuzzy tier is not an all-pairs scan — it pulls a handful of candidates from
// an inverted token index, so it stays ~O(files) rather than O(files x applicants).

export type MatchCandidate = { id: string; name: string; email: string };
export type DriveFileMeta = { id: string; name: string; mimeType?: string; modifiedTime?: string };

/** How a file was linked, best evidence first. Surfaced in the UI so a human can spot-check. */
export type MatchMethod = "email" | "name" | "token" | "fuzzy";
const METHOD_RANK: Record<MatchMethod, number> = { email: 0, name: 1, token: 2, fuzzy: 3 };

export type ResumeMatch = {
  file: DriveFileMeta;
  applicantId: string;
  method: MatchMethod;
  score: number; // 1 for exact tiers, 0..1 for fuzzy
};

export type MatchPlan = {
  /** One winning file per applicant. Safe to write straight to the DB. */
  matched: ResumeMatch[];
  /** No confident applicant — needs a human. */
  unmatched: DriveFileMeta[];
  /** Two or more applicants fit equally well; we refuse to guess. */
  ambiguous: { file: DriveFileMeta; applicantIds: string[] }[];
  /** Applicant had multiple candidate files; newest/strongest won, the rest are listed. */
  superseded: { applicantId: string; kept: DriveFileMeta; dropped: DriveFileMeta[] }[];
};

// Words that appear in resume filenames but carry no identity.
const NOISE = new Set([
  "resume", "resumes", "cv", "curriculum", "vitae", "cube", "consulting", "consultant",
  "application", "applicant", "apply", "app", "final", "finalized", "updated", "update",
  "current", "new", "latest", "draft", "copy", "version", "v", "docx", "doc", "pdf",
  "fall", "spring", "summer", "winter", "uiuc", "illinois", "uofi", "recruitment",
  "recruiting", "interview", "official", "my",
]);

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;

/** Drop the extension and any trailing "(1)" / " - Copy" duplicate marker. */
function stripFilename(name: string): string {
  return name
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .replace(/\((\d+)\)\s*$/, " ")
    .trim();
}

/**
 * Filename/name -> identity tokens: lowercased alphanumeric words with noise,
 * bare numbers, and single letters that aren't plausible initials removed.
 */
export function tokenize(raw: string): string[] {
  return stripFilename(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .filter((t) => !NOISE.has(t))
    .filter((t) => !/^\d+$/.test(t)) // years, dates, counters
    .filter((t) => !/^v\d+$/.test(t)); // v2, v3
}

/** Order-insensitive key: "Doe Jane" and "Jane Doe" collapse to the same string. */
function tokenKey(tokens: string[]): string {
  return [...tokens].sort().join(" ");
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  const union = a.size + b.size - shared;
  return union ? shared / union : 0;
}

type Indexed = {
  candidate: MatchCandidate;
  tokens: string[];
  set: Set<string>;
};

type Index = {
  byEmail: Map<string, string[]>; // full email -> applicant ids
  byLocal: Map<string, string[]>; // email local part (netid) -> ids
  byName: Map<string, string[]>; // exact ordered name key -> ids
  byToken: Map<string, string[]>; // sorted token key -> ids
  byWord: Map<string, string[]>; // single token -> ids (inverted index for the fuzzy tier)
  entries: Map<string, Indexed>;
};

function push(map: Map<string, string[]>, key: string, id: string) {
  if (!key) return;
  const cur = map.get(key);
  if (cur) cur.push(id);
  else map.set(key, [id]);
}

function buildIndex(candidates: MatchCandidate[]): Index {
  const idx: Index = {
    byEmail: new Map(), byLocal: new Map(), byName: new Map(),
    byToken: new Map(), byWord: new Map(), entries: new Map(),
  };
  for (const c of candidates) {
    const email = (c.email ?? "").trim().toLowerCase();
    const tokens = tokenize(c.name ?? "");
    idx.entries.set(c.id, { candidate: c, tokens, set: new Set(tokens) });

    push(idx.byEmail, email, c.id);
    const local = email.split("@")[0];
    if (local && local.length >= 3) push(idx.byLocal, local, c.id);
    push(idx.byName, tokens.join(" "), c.id);
    push(idx.byToken, tokenKey(tokens), c.id);
    for (const t of new Set(tokens)) push(idx.byWord, t, c.id);
  }
  return idx;
}

/** A hash hit only counts if exactly one applicant sits behind it. */
function unique(ids: string[] | undefined): string | null {
  return ids && ids.length === 1 ? ids[0] : null;
}

// Fuzzy acceptance thresholds. Deliberately strict — a wrong resume on a candidate
// is far worse than one that lands in the manual fix-up list.
const FUZZY_MIN = 0.6; // best score must clear this
const FUZZY_MARGIN = 0.2; // ...and beat the runner-up by this much
const COMMON_WORD_CAP = 25; // ignore tokens shared by more applicants than this

/**
 * Score one file against the small set of applicants that share a token with it.
 * Returns the best and runner-up so the caller can insist on a clear winner.
 */
function fuzzyRank(fileTokens: string[], idx: Index): { id: string; score: number }[] {
  const fileSet = new Set(fileTokens);
  const seen = new Set<string>();
  const ranked: { id: string; score: number }[] = [];

  for (const t of fileSet) {
    const ids = idx.byWord.get(t);
    if (!ids || ids.length > COMMON_WORD_CAP) continue;
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      const entry = idx.entries.get(id);
      if (!entry) continue;

      let score = jaccard(fileSet, entry.set);

      // "j doe" / "jdoe" style: surname matches and the other token is a prefix of
      // the given name. Common enough in netid-ish filenames to be worth a rule.
      const [first, ...rest] = entry.tokens;
      const last = rest[rest.length - 1];
      if (first && last && fileSet.has(last)) {
        for (const ft of fileSet) {
          if (ft !== last && first.startsWith(ft)) score = Math.max(score, 0.8);
        }
      }
      ranked.push({ id, score });
    }
  }
  return ranked.sort((a, b) => b.score - a.score);
}

/**
 * Match every file to at most one applicant, and every applicant to at most one file.
 *
 * Tiers, strongest first — the first that yields a *unique* applicant wins:
 *   email  an address or netid appears in the filename
 *   name   tokens match the applicant's name exactly, in order
 *   token  same tokens, any order ("Doe Jane")
 *   fuzzy  strong token overlap with a clear margin over the runner-up
 */
export function planResumeMatches(
  files: DriveFileMeta[],
  candidates: MatchCandidate[]
): MatchPlan {
  const idx = buildIndex(candidates);
  const plan: MatchPlan = { matched: [], unmatched: [], ambiguous: [], superseded: [] };

  // file id -> proposed match, before per-applicant conflict resolution
  const proposals: ResumeMatch[] = [];

  for (const file of files) {
    const raw = stripFilename(file.name ?? "");
    const tokens = tokenize(file.name ?? "");

    // Tier 1: a literal email address in the filename.
    const emailHit = EMAIL_RE.exec(raw.toLowerCase());
    const byEmail = emailHit ? unique(idx.byEmail.get(emailHit[0])) : null;
    if (byEmail) {
      proposals.push({ file, applicantId: byEmail, method: "email", score: 1 });
      continue;
    }

    if (tokens.length === 0) {
      plan.unmatched.push(file);
      continue;
    }

    // Tier 1b: a netid / email local part as one of the tokens.
    let byLocal: string | null = null;
    for (const t of tokens) {
      const hit = unique(idx.byLocal.get(t));
      if (hit) { byLocal = hit; break; }
    }
    if (byLocal) {
      proposals.push({ file, applicantId: byLocal, method: "email", score: 1 });
      continue;
    }

    // Tier 2/3: exact name, then order-insensitive tokens.
    const byName = unique(idx.byName.get(tokens.join(" ")));
    if (byName) {
      proposals.push({ file, applicantId: byName, method: "name", score: 1 });
      continue;
    }
    const byToken = unique(idx.byToken.get(tokenKey(tokens)));
    if (byToken) {
      proposals.push({ file, applicantId: byToken, method: "token", score: 1 });
      continue;
    }

    // An exact key that hit two applicants is a genuine tie — say so rather than guess.
    const tied = idx.byName.get(tokens.join(" ")) ?? idx.byToken.get(tokenKey(tokens));
    if (tied && tied.length > 1) {
      plan.ambiguous.push({ file, applicantIds: tied });
      continue;
    }

    // Tier 4: fuzzy, with a required margin.
    const ranked = fuzzyRank(tokens, idx);
    const best = ranked[0];
    const runnerUp = ranked[1];
    if (best && best.score >= FUZZY_MIN && (!runnerUp || best.score - runnerUp.score >= FUZZY_MARGIN)) {
      proposals.push({ file, applicantId: best.id, method: "fuzzy", score: Math.round(best.score * 100) / 100 });
    } else if (best && runnerUp && best.score >= FUZZY_MIN) {
      plan.ambiguous.push({ file, applicantIds: [best.id, runnerUp.id] });
    } else {
      plan.unmatched.push(file);
    }
  }

  // One resume per applicant: strongest evidence wins, newest file breaks ties.
  const byApplicant = new Map<string, ResumeMatch[]>();
  for (const p of proposals) {
    const cur = byApplicant.get(p.applicantId);
    if (cur) cur.push(p);
    else byApplicant.set(p.applicantId, [p]);
  }

  for (const [applicantId, group] of byApplicant) {
    group.sort((a, b) => {
      const rank = METHOD_RANK[a.method] - METHOD_RANK[b.method];
      if (rank !== 0) return rank;
      if (b.score !== a.score) return b.score - a.score;
      return (b.file.modifiedTime ?? "").localeCompare(a.file.modifiedTime ?? "");
    });
    const [kept, ...dropped] = group;
    plan.matched.push(kept);
    if (dropped.length) {
      plan.superseded.push({ applicantId, kept: kept.file, dropped: dropped.map((d) => d.file) });
    }
  }

  return plan;
}
