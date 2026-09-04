import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  createIssue,
  feedbackRepo,
  githubConfigured,
  issueBody,
  screenshotUrl,
} from "@/features/06-portal-feedback/lib/github";
import {
  attachIssue,
  createFeedbackRecord,
  recentFeedbackCount,
  saveScreenshot,
} from "@/features/06-portal-feedback/lib/store";
import {
  MAX_DESCRIPTION,
  decodeScreenshot,
  isFeedbackKind,
  type DecodedScreenshot,
} from "@/features/06-portal-feedback/lib/types";

// Any signed-in member may file feedback — that is the whole gate, and it is
// the right one. The widget only renders inside /portal, but the gate lives
// here rather than there: a route that files a public GitHub issue signed with
// someone's name cannot be protected by where a button happens to be drawn.
//
// There is no role check beyond authentication. Reporting that a page is broken
// is not a privileged act, and narrowing it to leadership would silence exactly
// the members who use the portal most and build it least.

export const dynamic = "force-dynamic";

/** Absolute base for the screenshot link. The issue outlives this request. */
function portalBaseUrl(req: NextRequest): string {
  const configured = process.env.PORTAL_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return req.nextUrl.origin;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  // Checked before anything is parsed or stored: the point of the ceiling is to
  // stop a run of issues reaching a public repo, so it has to sit in front of
  // the work rather than beside it.
  const { count, limit } = await recentFeedbackCount(email);
  if (count >= limit) {
    return NextResponse.json(
      {
        ok: false,
        error: `You've filed ${count} reports in the last hour. Give it a few minutes, or add to the existing issues.`,
      },
      { status: 429 }
    );
  }

  let body: {
    kind?: unknown;
    description?: unknown;
    page_path?: unknown;
    screenshot?: unknown;
    viewport?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!isFeedbackKind(body.kind)) {
    return NextResponse.json({ ok: false, error: "kind must be 'bug' or 'idea'" }, { status: 400 });
  }

  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!description) {
    return NextResponse.json({ ok: false, error: "Tell us what's wrong or what you'd like." }, { status: 400 });
  }
  if (description.length > MAX_DESCRIPTION) {
    return NextResponse.json(
      { ok: false, error: `Keep it under ${MAX_DESCRIPTION} characters.` },
      { status: 400 }
    );
  }

  // The path is client-supplied and lands in the issue, so it is treated as a
  // hint rather than as a fact: anything that isn't a plain in-site path is
  // dropped instead of being repeated back into a public document.
  const rawPath = typeof body.page_path === "string" ? body.page_path.trim() : "";
  const pagePath = /^\/[\w\-/[\]().]*$/.test(rawPath) ? rawPath.slice(0, 200) : "/portal";

  const rawViewport = typeof body.viewport === "string" ? body.viewport.trim() : "";
  const viewport = /^\d{2,5}×\d{2,5}$/.test(rawViewport) ? rawViewport : null;

  let shot: DecodedScreenshot | null = null;
  if (typeof body.screenshot === "string" && body.screenshot.length > 0) {
    const decoded = decodeScreenshot(body.screenshot);
    if (!decoded.ok) return NextResponse.json({ ok: false, error: decoded.error }, { status: 400 });
    shot = decoded.value;
  }

  // Refuse early when there is nowhere to file. Recording the row first and
  // then discovering this would leave a report the member believes reached
  // GitHub sitting in a table nobody reads.
  if (!githubConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Feedback isn't wired up on this deployment yet — FEEDBACK_GITHUB_TOKEN is unset.",
      },
      { status: 503 }
    );
  }

  const record = await createFeedbackRecord({
    member_id: session?.user?.memberId ?? null,
    member_email: email,
    member_name: session?.user?.name ?? null,
    member_role: session?.user?.role ?? null,
    kind: body.kind,
    description,
    page_path: pagePath,
    viewport,
  });

  // From here on nothing is allowed to abort the submission. Storage is where
  // this feature degrades — a bucket that was never created, a migration not
  // yet run — and a member who took the trouble to capture their screen should
  // still end up with an issue describing the problem.
  let shotUrl: string | null = null;
  let shotNote: string | null = null;

  if (shot) {
    if (!record.ok) {
      shotNote = record.demo
        ? "A screenshot was captured but this deployment has no Supabase storage configured, so it wasn't saved."
        : "A screenshot was captured but couldn't be stored. Ask the reporter to send it directly.";
    } else {
      const saved = await saveScreenshot(record.id, shot.bytes, shot.mime);
      if (saved.ok) {
        shotUrl = screenshotUrl(portalBaseUrl(req), record.id, shot.mime);
      } else {
        console.error("[feedback] screenshot upload failed:", saved.error);
        shotNote = "A screenshot was captured but couldn't be stored. Ask the reporter to send it directly.";
      }
    }
  }

  const issue = await createIssue({
    kind: body.kind,
    description,
    body: issueBody({
      kind: body.kind,
      description,
      memberName: session?.user?.name ?? null,
      memberEmail: email,
      memberRole: session?.user?.role ?? null,
      pagePath,
      viewport,
      screenshotUrl: shotUrl,
      screenshotNote: shotNote,
    }),
  });

  if (!issue.ok) {
    console.error("[feedback] issue creation failed:", issue.error);
    return NextResponse.json(
      {
        ok: false,
        // The row survives even when GitHub does not, so the report is not
        // actually lost — say so, because "couldn't file" reads as "gone".
        error: issue.error,
        recorded: record.ok,
      },
      { status: 502 }
    );
  }

  if (record.ok) await attachIssue(record.id, issue.number, issue.url);

  return NextResponse.json({
    ok: true,
    issue: { number: issue.number, url: issue.url, repo: feedbackRepo() },
    screenshotSaved: Boolean(shotUrl),
  });
}
