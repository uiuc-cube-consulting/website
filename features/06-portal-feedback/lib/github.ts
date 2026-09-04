// Filing the issue. Server-only — reads the PAT from the environment.

import { extensionFor, titleFor, type FeedbackKind, type ScreenshotMime } from "./types";

// Where issues land. Overridable so the club can move feedback into a private
// tracker later without a code change — see .env.example for why you might
// want to: this default repo is PUBLIC, and every issue filed here publishes
// the reporter's name and email address along with whatever they wrote.
const DEFAULT_REPO = "uiuc-cube-consulting/website";

const API = "https://api.github.com";

// A GitHub call that hangs would otherwise hold the whole serverless invocation
// until the platform kills it, and the member sees a spinner the entire time.
const TIMEOUT_MS = 10_000;

export type IssueResult =
  | { ok: true; number: number; url: string }
  | { ok: false; error: string; unconfigured?: boolean };

export function feedbackRepo(): string {
  return process.env.FEEDBACK_GITHUB_REPO?.trim() || DEFAULT_REPO;
}

// FEEDBACK_GITHUB_TOKEN is the name to set. GITHUB_TOKEN is accepted because it
// is what most people reach for first, and a token sitting in the environment
// under the obvious name failing silently is a bad half-hour.
function token(): string | null {
  return process.env.FEEDBACK_GITHUB_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim() || null;
}

export function githubConfigured(): boolean {
  return token() !== null;
}

/**
 * The issue body.
 *
 * Pure, and exported for tests: the reporter block is the reason this feature
 * exists ("so I can see which member did it"), and it is the part most likely
 * to be quietly broken by a later edit.
 *
 * On layout: metadata sits in a table ABOVE the member's prose, and the prose
 * gets its own heading. A member can of course type "**From:** someone else"
 * into their description — nothing stops them — but it lands visibly below the
 * separator, in the section labelled as theirs, rather than blending into the
 * fields the server asserted.
 */
// A markdown table row ends at the first unescaped pipe and at the first
// newline, so a member called "Ana | Ops" or a path someone hand-crafted would
// otherwise shear the metadata block in half. Escaping is enough — the values
// here are rendered by GitHub, which sanitizes HTML in issue bodies itself.
function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ").trim();
}

export function issueBody(input: {
  kind: FeedbackKind;
  description: string;
  memberName: string | null;
  memberEmail: string;
  memberRole: string | null;
  pagePath: string;
  viewport?: string | null;
  screenshotUrl: string | null;
  screenshotNote: string | null;
}): string {
  const who = input.memberName?.trim()
    ? `${input.memberName.trim()} · ${input.memberEmail}`
    : input.memberEmail;

  const rows: string[] = [
    `| | |`,
    `| --- | --- |`,
    `| **From** | ${cell(who)} |`,
    `| **Role** | ${cell(input.memberRole ?? "member")} |`,
    `| **Page** | \`${cell(input.pagePath).replace(/`/g, "")}\` |`,
  ];
  if (input.viewport) rows.push(`| **Viewport** | ${cell(input.viewport)} |`);
  rows.push(`| **Filed** | ${new Date().toISOString()} |`);

  const parts = [rows.join("\n"), "", "### What they said", "", input.description.trim()];

  if (input.screenshotUrl) {
    parts.push(
      "",
      "### Screenshot",
      "",
      // Deliberately a link and not an `![](…)` embed. The image is served from
      // a route that requires a portal session, so GitHub's image proxy — which
      // fetches anonymously — would render a broken image here every time. A
      // link at least says what it is and works once you click it.
      `[Open the screenshot](${input.screenshotUrl}) · requires a CUBE portal sign-in.`
    );
  } else if (input.screenshotNote) {
    parts.push("", "### Screenshot", "", `_${input.screenshotNote}_`);
  }

  parts.push("", "---", "", "<sub>Filed from the member portal's feedback widget.</sub>");
  return parts.join("\n");
}

/** Absolute URL of the gated screenshot route, for the issue body. */
export function screenshotUrl(base: string, id: string, mime: ScreenshotMime): string {
  // The extension is cosmetic — the route reads the id — but it makes the link
  // and any resulting "save as" produce a sensibly named file.
  return `${base.replace(/\/+$/, "")}/api/feedback/screenshot/${id}.${extensionFor(mime)}`;
}

type CreateInput = {
  kind: FeedbackKind;
  title?: string;
  description: string;
  body: string;
};

/**
 * Create the issue.
 *
 * Labels and the assignee are best-effort. GitHub answers 422 for an assignee
 * without push access to the repo — an easy thing to get wrong when setting
 * FEEDBACK_GITHUB_ASSIGNEE, and not a reason to drop a member's report on the
 * floor. So a 422 is retried once with the title and body alone, which is the
 * part that actually matters.
 */
export async function createIssue(input: CreateInput): Promise<IssueResult> {
  const pat = token();
  if (!pat) {
    return {
      ok: false,
      unconfigured: true,
      error: "GitHub isn't configured on this deployment, so the issue wasn't filed.",
    };
  }

  const repo = feedbackRepo();
  const title = input.title ?? titleFor(input.kind, input.description);
  const assignee = process.env.FEEDBACK_GITHUB_ASSIGNEE?.trim();

  const full: Record<string, unknown> = {
    title,
    body: input.body,
    labels: ["member-feedback", input.kind === "bug" ? "bug" : "enhancement"],
  };
  if (assignee) full.assignees = [assignee];

  const first = await post(repo, pat, full);
  if (first.ok || first.status !== 422) return first.result;

  const retry = await post(repo, pat, { title, body: input.body });
  return retry.result;
}

async function post(
  repo: string,
  pat: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; status: number; result: IssueResult }> {
  let res: Response;
  try {
    res = await fetch(`${API}/repos/${repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "cube-portal-feedback",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return {
      ok: false,
      status: 0,
      result: {
        ok: false,
        error: timedOut ? "GitHub took too long to respond." : "Could not reach GitHub.",
      },
    };
  }

  if (res.ok) {
    const json = (await res.json()) as { number?: number; html_url?: string };
    if (typeof json.number !== "number" || typeof json.html_url !== "string") {
      return { ok: false, status: res.status, result: { ok: false, error: "GitHub returned an unexpected response." } };
    }
    return { ok: true, status: res.status, result: { ok: true, number: json.number, url: json.html_url } };
  }

  // The token and the repo name are the two things that are actually wrong when
  // this fails in practice, and a bare "422" tells whoever is on call neither.
  const detail = await res.text().catch(() => "");
  const message =
    res.status === 401 || res.status === 403
      ? `GitHub rejected the token (${res.status}). Check FEEDBACK_GITHUB_TOKEN has issues:write on ${repo}.`
      : res.status === 404
        ? `GitHub can't see ${repo} — check FEEDBACK_GITHUB_REPO and the token's repository access.`
        : res.status === 410
          ? `Issues are disabled on ${repo}.`
          : `GitHub returned ${res.status}. ${detail.slice(0, 300)}`;

  return { ok: false, status: res.status, result: { ok: false, error: message } };
}
