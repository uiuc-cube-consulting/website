// The weekly nudge. Reuses the portal's email shell (lib/email/strikes.ts →
// wrapInShell) so this looks like every other message the portal sends and
// there is one place to restyle.

import { wrapInShell } from "@/lib/email/strikes";
import { weekRangeLabel } from "./week";
import type { Project } from "./types";

export function reminderEmail(args: {
  recipientName: string;
  project: Project;
  week: number;
  filled: number;
  total: number;
  portalUrl: string;
}): { subject: string; html: string } {
  const { recipientName, project, week, filled, total, portalUrl } = args;
  const remaining = Math.max(total - filled, 0);
  const firstName = recipientName.split(/\s+/)[0] || "there";

  // The subject carries the whole ask, so a phone lockscreen is enough to know
  // what's owed without opening anything.
  const subject =
    filled === 0
      ? `Week ${week} check-in for ${project.name}`
      : `Week ${week} check-in for ${project.name} — ${remaining} left`;

  const progress =
    filled === 0
      ? `<p>Nothing is filled in yet for <strong>Week ${week}</strong> (${weekRangeLabel(
          project.starts_on,
          week
        )}).</p>`
      : `<p>You're <strong>${filled} of ${total}</strong> through <strong>Week ${week}</strong> (${weekRangeLabel(
          project.starts_on,
          week
        )}) — ${remaining} rating${remaining === 1 ? "" : "s"} left.</p>`;

  const innerHtml = `
    <p class="eyebrow">Accountability check-in</p>
    <h1>${project.name} · Week ${week}</h1>
    <p>Hi ${escapeHtml(firstName)},</p>
    ${progress}
    <p>Rate each consultant on work quality, behavior, and initiative. Most weeks
    this is one click — set the whole grid to Meets, then change the exceptions.</p>
    <p style="margin:28px 0;">
      <a href="${portalUrl}"
         style="display:inline-block;background:#d4a657;color:#15110b;text-decoration:none;
                font-weight:700;font-size:15px;padding:12px 28px;border-radius:9999px;">
        Fill out Week ${week}
      </a>
    </p>
    <p style="font-size:13px;color:#888;">Only you, your project's other lead, and the
    exec board can see these ratings.</p>
  `.trim();

  return { subject, html: wrapInShell(subject, innerHtml) };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
