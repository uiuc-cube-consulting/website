// Pure pipeline/CRM domain logic — types, the stage model, stage normalization,
// funnel metrics, the access helper, and demo data. NO server-only imports here, so
// this module is safe to import from client components. The Google Sheets reader
// (which needs `googleapis`) lives in ./source.ts.

/** Ordered FUNNEL stages (prospect → … → testimonial). Order drives the metrics. */
export const STAGES = [
  { key: "prospect", label: "Prospect", hint: "Sourced, not yet contacted" },
  { key: "contacted", label: "Contacted", hint: "Cold email sent" },
  { key: "replied", label: "Replied", hint: "They responded" },
  { key: "call", label: "Call booked", hint: "Intro call scheduled" },
  { key: "loi", label: "LOI", hint: "Letter of intent / agreement" },
  { key: "active", label: "Active", hint: "Engagement in flight" },
  { key: "shipped", label: "Shipped", hint: "Deliverables handed off" },
  { key: "testimonial", label: "Testimonial", hint: "Closed the loop" },
] as const;

/** Terminal OUTCOME buckets — sit outside the funnel, excluded from conversion metrics. */
export const OUTCOME_STAGES = [
  { key: "not_pursuing", label: "Not pursuing", hint: "Decided not to pursue" },
  { key: "could_not_find", label: "Could not find", hint: "No contact info found" },
] as const;

/** Every column shown on the board (funnel + outcomes). */
export const BOARD_STAGES = [...STAGES, ...OUTCOME_STAGES];

export type StageKey =
  | (typeof STAGES)[number]["key"]
  | (typeof OUTCOME_STAGES)[number]["key"];

/** Funnel stage keys — drive the ordered metrics. */
export const STAGE_KEYS = STAGES.map((s) => s.key) as StageKey[];
/** All stage keys incl. the two outcomes — used for normalization/board. */
export const ALL_STAGE_KEYS = BOARD_STAGES.map((s) => s.key) as StageKey[];
/** Index within the funnel. Outcome stages are intentionally absent (not in the funnel). */
export const STAGE_INDEX = Object.fromEntries(
  STAGES.map((s, i) => [s.key, i])
) as Record<StageKey, number>;

export type Lead = {
  id: string;
  name: string;
  company: string;
  email?: string;
  industry?: string;
  source?: string; // apollo / prospects / alumni / inbound
  stage: StageKey;
  owner?: string;
  lastContacted?: string; // ISO date
  // Stage-entry timestamps → power the funnel metrics for free.
  contactedAt?: string;
  repliedAt?: string;
  callAt?: string;
  loiAt?: string;
  activeAt?: string;
  shippedAt?: string;
  notes?: string;
  /** Arbitrary extra fields a user adds to a card (editable board). */
  custom?: Record<string, string>;
};

export type SourceKind = "sheet" | "supabase" | "demo";

// ──────────────────────────────────────────────────────────────────────────
// Stage normalization — the bot/humans may write free-text stages in the Sheet.
// ──────────────────────────────────────────────────────────────────────────
const STAGE_ALIASES: Record<string, StageKey> = {
  prospect: "prospect", new: "prospect", lead: "prospect", sourced: "prospect",
  contacted: "contacted", emailed: "contacted", sent: "contacted", outreach: "contacted",
  replied: "replied", responded: "replied", reply: "replied", engaged: "replied",
  call: "call", "call booked": "call", meeting: "call", "intro call": "call", scheduled: "call",
  loi: "loi", "letter of intent": "loi", agreement: "loi", signed: "loi", proposal: "loi",
  active: "active", "in progress": "active", working: "active",
  shipped: "shipped", delivered: "shipped", complete: "shipped", completed: "shipped", done: "shipped",
  testimonial: "testimonial", referral: "testimonial", "closed won": "testimonial",
  // Terminal outcomes
  not_pursuing: "not_pursuing", "not pursuing": "not_pursuing", "not-pursuing": "not_pursuing",
  pass: "not_pursuing", declined: "not_pursuing", "not interested": "not_pursuing", lost: "not_pursuing", "closed lost": "not_pursuing",
  could_not_find: "could_not_find", "could not find": "could_not_find", "could-not-find": "could_not_find",
  "not found": "could_not_find", "no contact": "could_not_find", "no email": "could_not_find", unreachable: "could_not_find",
};

export function normalizeStage(raw: string): StageKey {
  const k = (raw || "").trim().toLowerCase();
  return STAGE_ALIASES[k] ?? (ALL_STAGE_KEYS.includes(k as StageKey) ? (k as StageKey) : "prospect");
}

// ──────────────────────────────────────────────────────────────────────────
// Access: the pipeline is EXEC-BOARD ONLY. Authorization uses session.user.role
// (from the strike_system members table), with an env fallback before that auth is
// live. Pure (no server-only imports) so routes can share it.
// ──────────────────────────────────────────────────────────────────────────
export type SessionLike = { user?: { email?: string | null; role?: string } } | null;

export function isExec(session: SessionLike): boolean {
  const role = session?.user?.role;
  if (role) return role === "exec";
  const allow = (process.env.PIPELINE_EXEC_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const email = session?.user?.email?.toLowerCase();
  if (allow.length) return Boolean(email && allow.includes(email));
  return true; // fully unconfigured → open for local dev (board shows demo data)
}

// ──────────────────────────────────────────────────────────────────────────
// Metrics — all pure, computed from the leads array.
// ──────────────────────────────────────────────────────────────────────────
export type StageStat = {
  key: StageKey;
  label: string;
  count: number;
  reached: number;
  conversionFromPrev: number | null;
};

export type PipelineMetrics = {
  total: number;
  stages: StageStat[];
  replyRate: number; // reached "replied" / reached "contacted"
  winRate: number; // reached "active"+ / total
  avgDaysToLOI: number | null;
  bySource: { source: string; total: number; won: number; winRate: number }[];
  outcomes: { not_pursuing: number; could_not_find: number };
};

function daysBetween(a?: string, b?: string): number | null {
  if (!a || !b) return null;
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (Number.isNaN(da) || Number.isNaN(db)) return null;
  return Math.round((db - da) / 86_400_000);
}

export function computeMetrics(leads: Lead[]): PipelineMetrics {
  // Metrics are computed over FUNNEL leads only — the two outcome buckets
  // (not pursuing / could not find) are terminal and don't belong in conversion math.
  const funnel = new Set<StageKey>(STAGE_KEYS);
  const funnelLeads = leads.filter((l) => funnel.has(l.stage));
  const total = funnelLeads.length;
  const reachedCount = (idx: number) => funnelLeads.filter((l) => STAGE_INDEX[l.stage] >= idx).length;

  const stages: StageStat[] = STAGES.map((s, i) => {
    const count = funnelLeads.filter((l) => l.stage === s.key).length;
    const reached = reachedCount(i);
    const prevReached = i === 0 ? null : reachedCount(i - 1);
    const conversionFromPrev =
      i === 0 ? null : prevReached && prevReached > 0 ? Math.round((reached / prevReached) * 100) : 0;
    return { key: s.key, label: s.label, count, reached, conversionFromPrev };
  });

  const reachedContacted = reachedCount(STAGE_INDEX.contacted);
  const reachedReplied = reachedCount(STAGE_INDEX.replied);
  const reachedActive = reachedCount(STAGE_INDEX.active);
  const replyRate = reachedContacted ? Math.round((reachedReplied / reachedContacted) * 100) : 0;
  const winRate = total ? Math.round((reachedActive / total) * 100) : 0;

  const loiDurations = funnelLeads
    .map((l) => daysBetween(l.contactedAt, l.loiAt))
    .filter((d): d is number => d !== null && d >= 0);
  const avgDaysToLOI = loiDurations.length
    ? Math.round(loiDurations.reduce((a, b) => a + b, 0) / loiDurations.length)
    : null;

  const sourceMap = new Map<string, { total: number; won: number }>();
  for (const l of funnelLeads) {
    const key = l.source || "unknown";
    const entry = sourceMap.get(key) ?? { total: 0, won: 0 };
    entry.total += 1;
    if (STAGE_INDEX[l.stage] >= STAGE_INDEX.active) entry.won += 1;
    sourceMap.set(key, entry);
  }
  const bySource = [...sourceMap.entries()]
    .map(([source, { total: t, won }]) => ({ source, total: t, won, winRate: t ? Math.round((won / t) * 100) : 0 }))
    .sort((a, b) => b.total - a.total);

  const outcomes = {
    not_pursuing: leads.filter((l) => l.stage === "not_pursuing").length,
    could_not_find: leads.filter((l) => l.stage === "could_not_find").length,
  };

  return { total, stages, replyRate, winRate, avgDaysToLOI, bySource, outcomes };
}

// Access control: the pipeline is exec-board-only, enforced in
// app/api/pipeline/route.ts via session.user.role === "exec" (the role comes from
// the strike_system PR's members table + auth.ts). No members table is defined here.

// ──────────────────────────────────────────────────────────────────────────
// Demo pipeline (used until PIPELINE_SHEET_ID + creds are set). Fictional
// companies so it's never confused with real prospects.
// ──────────────────────────────────────────────────────────────────────────
export const DEMO_PIPELINE: Lead[] = [
  { id: "northwind-1", name: "Priya Shah", company: "Northwind Robotics", industry: "Hardware", source: "apollo", stage: "prospect", owner: "Outreach bot" },
  { id: "lumen-2", name: "Marcus Lee", company: "Lumen Health", industry: "Healthtech", source: "apollo", stage: "contacted", owner: "Outreach bot", lastContacted: "2026-06-15", contactedAt: "2026-06-15" },
  { id: "atlas-3", name: "Dana Whitfield", company: "Atlas Logistics", industry: "Logistics", source: "prospects", stage: "contacted", owner: "Outreach bot", lastContacted: "2026-06-16", contactedAt: "2026-06-16" },
  { id: "verde-4", name: "Sofia Ramirez", company: "Verde Foods", industry: "CPG", source: "alumni", stage: "replied", owner: "Director", lastContacted: "2026-06-12", contactedAt: "2026-06-09", repliedAt: "2026-06-12" },
  { id: "cobalt-5", name: "Tom Nguyen", company: "Cobalt Energy", industry: "Energy", source: "apollo", stage: "replied", owner: "Director", lastContacted: "2026-06-14", contactedAt: "2026-06-10", repliedAt: "2026-06-14" },
  { id: "harborfoods-x", name: "Eli Park", company: "Harbor Foods", industry: "CPG", source: "apollo", stage: "not_pursuing", owner: "Director", notes: "Out of budget this cycle — revisit next term." },
  { id: "driftlabs-x", name: "—", company: "Drift Labs", industry: "SaaS", source: "prospects", stage: "could_not_find", owner: "Outreach bot", notes: "No valid contact email found." },
  { id: "harbor-6", name: "Aisha Khan", company: "Harbor Fintech", industry: "Fintech", source: "inbound", stage: "call", owner: "Director", lastContacted: "2026-06-11", contactedAt: "2026-06-05", repliedAt: "2026-06-08", callAt: "2026-06-11" },
  { id: "pinecone-7", name: "Greg Olsen", company: "Pinecone Labs", industry: "Biotech", source: "alumni", stage: "loi", owner: "Director", contactedAt: "2026-05-20", repliedAt: "2026-05-23", callAt: "2026-05-28", loiAt: "2026-06-04" },
  { id: "meridian-8", name: "Lauren Park", company: "Meridian SaaS", industry: "SaaS", source: "inbound", stage: "active", owner: "PM: Sujan", contactedAt: "2026-05-01", repliedAt: "2026-05-03", callAt: "2026-05-08", loiAt: "2026-05-15", activeAt: "2026-05-20" },
  { id: "orbital-9", name: "Devon Carter", company: "Orbital Mfg", industry: "Manufacturing", source: "apollo", stage: "active", owner: "PM: Neha", contactedAt: "2026-04-22", repliedAt: "2026-04-25", callAt: "2026-04-30", loiAt: "2026-05-09", activeAt: "2026-05-14" },
  { id: "brightwave-10", name: "Hana Suzuki", company: "Brightwave AI", industry: "AI", source: "inbound", stage: "shipped", owner: "PM: Jonah", contactedAt: "2026-02-10", repliedAt: "2026-02-12", callAt: "2026-02-18", loiAt: "2026-02-27", activeAt: "2026-03-04", shippedAt: "2026-05-01" },
  { id: "stonebridge-11", name: "Will Turner", company: "Stonebridge Capital", industry: "Finance", source: "alumni", stage: "shipped", owner: "PM: Andrea", contactedAt: "2026-01-28", repliedAt: "2026-02-01", callAt: "2026-02-06", loiAt: "2026-02-14", activeAt: "2026-02-20", shippedAt: "2026-04-25" },
  { id: "kestrel-12", name: "Maya Brooks", company: "Kestrel Mobility", industry: "Mobility", source: "apollo", stage: "testimonial", owner: "PM: Daniel", contactedAt: "2025-09-15", repliedAt: "2025-09-18", callAt: "2025-09-24", loiAt: "2025-10-02", activeAt: "2025-10-08", shippedAt: "2025-12-05" },
  { id: "solstice-13", name: "Ethan Wright", company: "Solstice Retail", industry: "Retail", source: "prospects", stage: "prospect", owner: "Outreach bot" },
  { id: "vantage-14", name: "Grace Kim", company: "Vantage Media", industry: "Media", source: "apollo", stage: "contacted", owner: "Outreach bot", lastContacted: "2026-06-17", contactedAt: "2026-06-17" },
];
