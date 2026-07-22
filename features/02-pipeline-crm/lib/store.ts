// Server-only data layer for the editable pipeline board. The board reads/writes
// the Supabase `pipeline_leads` table; "sync" imports from the bot's Leads sheet.
// Never import from a client component (uses the Supabase service-role client).

import { createServerClient } from "@/lib/supabase/server";
import { fetchPipeline } from "./source";
import { DEMO_PIPELINE, normalizeStage, type Lead, type SourceKind, type StageKey } from "./pipeline";

function db() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createServerClient();
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function leadKey(l: { email?: string; company?: string; name?: string }): string {
  const email = (l.email ?? "").trim().toLowerCase();
  if (email) return email;
  return slug(`${l.company ?? ""}-${l.name ?? ""}`) || "lead";
}

type Row = {
  id: string;
  name: string | null;
  company: string | null;
  email: string | null;
  industry: string | null;
  source: string | null;
  stage: string;
  owner: string | null;
  notes: string | null;
  custom: Record<string, string> | null;
  contacted_at: string | null;
  replied_at: string | null;
  last_contacted: string | null;
};

function rowToLead(r: Row): Lead {
  return {
    id: r.id,
    name: r.name ?? r.company ?? "",
    company: r.company ?? r.name ?? "",
    email: r.email ?? undefined,
    industry: r.industry ?? undefined,
    source: r.source ?? undefined,
    stage: normalizeStage(r.stage),
    owner: r.owner ?? undefined,
    notes: r.notes ?? undefined,
    custom: r.custom ?? undefined,
    contactedAt: r.contacted_at ?? undefined,
    repliedAt: r.replied_at ?? undefined,
    lastContacted: r.last_contacted ?? undefined,
  };
}

export async function getLeads(): Promise<{ leads: Lead[]; source: SourceKind }> {
  const sb = db();
  if (!sb) return { leads: DEMO_PIPELINE, source: "demo" };
  const { data, error } = await sb
    .from("pipeline_leads")
    .select("*")
    .order("position", { ascending: true })
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return { leads: (data ?? []).map((r) => rowToLead(r as Row)), source: "supabase" };
}

export type LeadPatch = Partial<{
  stage: string;
  name: string;
  company: string;
  email: string;
  industry: string;
  source: string;
  owner: string;
  notes: string;
  custom: Record<string, string>;
  position: number;
}>;

export type WriteResult = { ok: boolean; demo?: boolean; error?: string };

export async function updateLead(id: string, patch: LeadPatch): Promise<WriteResult> {
  const sb = db();
  if (!sb) return { ok: false, demo: true };

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const allow: (keyof LeadPatch)[] = [
    "stage", "name", "company", "email", "industry", "source", "owner", "notes", "custom", "position",
  ];
  for (const k of allow) {
    if (patch[k] === undefined) continue;
    update[k] = k === "stage" ? (normalizeStage(String(patch.stage)) as StageKey) : patch[k];
  }

  const { error } = await sb.from("pipeline_leads").update(update).eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export type ImportResult = { ok: boolean; demo?: boolean; error?: string; inserted?: number; updated?: number; source?: SourceKind };

/**
 * Sync from the bot's Leads sheet into pipeline_leads. New leads are inserted with a
 * stage derived from the sheet; existing leads only have their SOURCE fields refreshed
 * so a human's stage / notes / custom / position edits are preserved.
 */
export async function importFromSheet(): Promise<ImportResult> {
  const sb = db();
  if (!sb) return { ok: false, demo: true };

  // Precise diagnostics: the sheet read needs BOTH an id and a credential.
  const hasSheet = Boolean(process.env.PIPELINE_SHEET_ID || process.env.SHEET_ID);
  const hasCred = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_API_KEY);
  if (!hasSheet || !hasCred) {
    const missing = [
      !hasSheet && "PIPELINE_SHEET_ID",
      !hasCred && "a Google credential (GOOGLE_API_KEY or GOOGLE_SERVICE_ACCOUNT_JSON)",
    ]
      .filter(Boolean)
      .join(" and ");
    return { ok: false, error: `Sync needs ${missing} set in the environment, then a redeploy.` };
  }

  const { leads, source } = await fetchPipeline();
  if (source === "demo") {
    return { ok: false, error: "Couldn't read the outreach sheet — verify PIPELINE_SHEET_ID and that the credential can access it." };
  }

  const { data: existingRows, error: exErr } = await sb.from("pipeline_leads").select("lead_key");
  if (exErr) return { ok: false, error: exErr.message };
  const have = new Set((existingRows ?? []).map((r) => String((r as { lead_key: string }).lead_key)));

  const toInsert: Record<string, unknown>[] = [];
  let updated = 0;
  for (const l of leads) {
    const key = leadKey(l);
    const baseFields = {
      name: l.name ?? null,
      company: l.company ?? null,
      email: l.email ?? null,
      industry: l.industry ?? null,
      source: l.source ?? null,
      contacted_at: l.contactedAt ?? null,
      replied_at: l.repliedAt ?? null,
      last_contacted: l.lastContacted ?? null,
    };
    if (have.has(key)) {
      // refresh source fields only — preserve human edits (stage/notes/custom/position)
      const { error } = await sb.from("pipeline_leads").update(baseFields).eq("lead_key", key);
      if (!error) updated += 1;
    } else {
      toInsert.push({ lead_key: key, stage: l.stage, ...baseFields });
    }
  }

  if (toInsert.length) {
    const { error } = await sb.from("pipeline_leads").insert(toInsert);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true, inserted: toInsert.length, updated, source };
}
