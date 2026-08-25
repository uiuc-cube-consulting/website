import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { sendEmail } from "@/lib/email/send";
import { getReminderTargets, markReminded } from "@/features/05-accountability-tracker/lib/store";
import { reminderEmail } from "@/features/05-accountability-tracker/lib/email";
import { isExec } from "@/features/05-accountability-tracker/lib/access";

export const dynamic = "force-dynamic";

/**
 * The weekly nudge. Emails only the PMs/SCs with an unfinished week, and only
 * once per (project, week, person) — `accountability_reminders` is the ledger,
 * so a cron retry or a manual re-run is a no-op rather than a second nag.
 *
 * Two callers:
 *   - Vercel Cron (`vercel.json`), authenticated by `Authorization: Bearer $CRON_SECRET`.
 *   - An exec hitting "Send reminders now" in the portal.
 *
 * GET and POST both work: Vercel Cron issues a GET, the portal button POSTs.
 */
async function run(req: NextRequest) {
  const authorized = await isAuthorized(req);
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const targets = await getReminderTargets();
  const baseUrl = portalBaseUrl(req);

  let sent = 0;
  const failures: string[] = [];

  for (const target of targets) {
    const delivered: string[] = [];

    for (const recipient of target.recipients) {
      const { subject, html } = reminderEmail({
        recipientName: recipient.full_name,
        project: target.project,
        week: target.week,
        filled: target.filled,
        total: target.total,
        portalUrl: `${baseUrl}/portal/accountability?project=${target.project.id}&week=${target.week}`,
      });

      try {
        await sendEmail({ to: recipient.email, subject, html });
        delivered.push(recipient.member_id);
        sent++;
      } catch (e) {
        // One bad address must not stop the rest of the cohort being reminded.
        console.error(`Accountability reminder to ${recipient.email} failed:`, e);
        failures.push(recipient.email);
      }
    }

    // Ledger only the ones that actually went out, so a failure is retried next run.
    await markReminded(target.project.id, target.week, delivered);
  }

  return NextResponse.json({
    ok: true,
    projects: targets.length,
    sent,
    failures: failures.length ? failures : undefined,
  });
}

export const GET = run;
export const POST = run;

/** Cron secret, or an exec clicking the button. Nothing else. */
async function isAuthorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get("authorization");
    if (header === `Bearer ${secret}`) return true;
  }

  const session = await auth();
  if (!session?.user?.memberId) return false;
  return isExec({ memberId: session.user.memberId, role: session.user.role });
}

/**
 * Absolute base for the email's link. The cron runs server-side with no browser
 * origin to inherit, so an env var wins; VERCEL_URL covers preview deploys.
 */
function portalBaseUrl(req: NextRequest): string {
  const configured = process.env.PORTAL_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return req.nextUrl.origin;
}
