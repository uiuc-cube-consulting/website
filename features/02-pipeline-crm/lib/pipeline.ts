// Pure pipeline/CRM domain logic — types, the stage model, stage normalization,
// funnel metrics, the access helper, and demo data. NO server-only imports here, so
// this module is safe to import from client components. The Google Sheets reader
// (which needs `googleapis`) lives in ./source.ts.

/** Ordered pipeline stages (prospect → … → testimonial). Order drives the funnel. */
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

export type StageKey = (typeof STAGES)[number]["key"];
export const STAGE_KEYS = STAGES.map((s) => s.key) as StageKey[];
export const STAGE_INDEX: Record<StageKey, number> = Object.fromEntries(
  STAGE_KEYS.map((k, i) => [k, i])
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
};

export type SourceKind = "sheet" | "demo";

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
};

export function normalizeStage(raw: string): StageKey {
  const k = (raw || "").trim().toLowerCase();
  return STAGE_ALIASES[k] ?? (STAGE_KEYS.includes(k as StageKey) ? (k as StageKey) : "prospect");
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
};

function daysBetween(a?: string, b?: string): number | null {
  if (!a || !b) return null;
  const da = Date.parse(a);
  const db = Date.parse(b);
  if (Number.isNaN(da) || Number.isNaN(db)) return null;
  return Math.round((db - da) / 86_400_000);
}

export function computeMetrics(leads: Lead[]): PipelineMetrics {
  const total = leads.length;
  const reachedCount = (idx: number) => leads.filter((l) => STAGE_INDEX[l.stage] >= idx).length;

  const stages: StageStat[] = STAGES.map((s, i) => {
    const count = leads.filter((l) => l.stage === s.key).length;
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

  const loiDurations = leads
    .map((l) => daysBetween(l.contactedAt, l.loiAt))
    .filter((d): d is number => d !== null && d >= 0);
  const avgDaysToLOI = loiDurations.length
    ? Math.round(loiDurations.reduce((a, b) => a + b, 0) / loiDurations.length)
    : null;

  const sourceMap = new Map<string, { total: number; won: number }>();
  for (const l of leads) {
    const key = l.source || "unknown";
    const entry = sourceMap.get(key) ?? { total: 0, won: 0 };
    entry.total += 1;
    if (STAGE_INDEX[l.stage] >= STAGE_INDEX.active) entry.won += 1;
    sourceMap.set(key, entry);
  }
  const bySource = [...sourceMap.entries()]
    .map(([source, { total: t, won }]) => ({ source, total: t, won, winRate: t ? Math.round((won / t) * 100) : 0 }))
    .sort((a, b) => b.total - a.total);

  return { total, stages, replyRate, winRate, avgDaysToLOI, bySource };
}

// Access control lives in features/05-members/lib/members.ts (canViewPipeline) —
// the pipeline is exec-board-only, sourced from the Supabase members table (with an
// env fallback). It's enforced in app/api/pipeline/route.ts.

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
