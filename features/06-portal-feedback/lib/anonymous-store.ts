// The spam guard for the anonymous channel, and the ONLY place a sender's
// identity is touched. Server-only; never import this from client code.
//
// The tension this file exists to resolve: a form that emails two exec inboxes
// needs a ceiling, and any per-person ceiling needs to recognise the person.
// So it recognises a HASH of them, under a secret that lives in the
// environment rather than the database, and it records the HOUR rather than
// the minute — which is all a quota needs and is deliberately too coarse to
// line up against the arrival time of a particular email.
//
// What that buys, precisely: someone who can read this table sees that an
// account they cannot name sent a note in some hour. What it does not buy:
// protection from someone holding BOTH the database and the secret, in a club
// small enough to try every member's address against the hash. That person is
// whoever deploys the site. The form says so rather than implying otherwise —
// a promise nobody can audit is worth less than a narrow one that holds.

import { createHmac } from "node:crypto";
import { createServerClient } from "@/lib/supabase/server";

const TABLE = "anonymous_report_quota";

function db() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createServerClient();
}

/**
 * The secret the sender hash is keyed with.
 *
 * ANONYMOUS_REPORT_SALT is the name to set. AUTH_SECRET is accepted as a
 * fallback because it is always present on a working deployment, and a quota
 * that silently stops working is worse than one keyed with a secret that
 * already exists.
 */
function pepper(): string | null {
  return process.env.ANONYMOUS_REPORT_SALT?.trim() || process.env.AUTH_SECRET?.trim() || null;
}

/**
 * A member's quota key. HMAC, not a bare digest: a plain SHA-256 of an
 * @illinois.edu address is reversible by anyone willing to hash sixty names,
 * which is not a hash at all in a club this size.
 *
 * Returns null when there is no secret to key it with — the caller skips the
 * quota rather than writing something reversible, because a table of
 * recoverable member addresses beside a timestamp is exactly the artifact this
 * feature must not create.
 */
export function senderHash(email: string): string | null {
  const secret = pepper();
  if (!secret) return null;
  return createHmac("sha256", secret).update(email.trim().toLowerCase()).digest("hex");
}

/** Notes one member may send an hour. */
function rateLimit(): number {
  const raw = Number(process.env.ANONYMOUS_REPORT_RATE_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 5;
}

/** The hour this moment falls in. The only time resolution ever stored. */
export function windowStart(now: Date = new Date()): string {
  const d = new Date(now);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

export type Quota = { allowed: boolean; sent: number; limit: number };

/**
 * How many notes this member has already sent this hour.
 *
 * Allows on every failure path — no secret, no Supabase, no table yet, a read
 * error. Same call the feedback widget makes for the same reason: the table is
 * created by SQL somebody runs by hand, and a member working up the nerve to
 * report something should not be turned away because a migration is late.
 */
export async function checkQuota(email: string): Promise<Quota> {
  const limit = rateLimit();
  const hash = senderHash(email);
  const sb = db();
  if (!hash || !sb) return { allowed: true, sent: 0, limit };

  const { data, error } = await sb
    .from(TABLE)
    .select("sent")
    .eq("sender_hash", hash)
    .eq("window_start", windowStart())
    .maybeSingle();

  if (error || !data) return { allowed: true, sent: 0, limit };
  const sent = Number(data.sent) || 0;
  return { allowed: sent < limit, sent, limit };
}

/**
 * Count one note against this hour's allowance.
 *
 * Read-then-write, so two notes sent in the same instant can both see the same
 * count and one extra gets through. That is the right trade here: the
 * alternative is a stored procedure to make a spam guard exact, and being off
 * by one on a limit of five costs nothing.
 *
 * Best-effort throughout. The email has already been sent by the time this is
 * called, and failing the request afterwards would tell a member their note
 * never arrived when it did.
 */
export async function recordSend(email: string): Promise<void> {
  const hash = senderHash(email);
  const sb = db();
  if (!hash || !sb) return;

  const window = windowStart();
  const { data } = await sb
    .from(TABLE)
    .select("sent")
    .eq("sender_hash", hash)
    .eq("window_start", window)
    .maybeSingle();

  const { error } = await sb
    .from(TABLE)
    .upsert(
      { sender_hash: hash, window_start: window, sent: (Number(data?.sent) || 0) + 1 },
      { onConflict: "sender_hash,window_start" }
    );
  if (error) console.error("[anonymous] quota write failed:", error.message);
}
