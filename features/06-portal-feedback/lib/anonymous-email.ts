// The email exec actually receives. Pure and exported for tests: this file is
// the last thing standing between a member's promise of anonymity and two
// inboxes, so what it does and does not put in the message is worth pinning.

import { wrapInShell } from "@/lib/email/strikes";
import { MAX_CONTACT, topicLabel, type AnonymousTopic } from "./anonymous";

// Where anonymous notes go. Overridable so the club can change who reads them
// without a deploy — a comma-separated list in ANONYMOUS_REPORT_RECIPIENTS.
const DEFAULT_RECIPIENTS = ["director@cubeconsulting.org", "hr@cubeconsulting.org"];

export function anonymousRecipients(): string[] {
  const configured = process.env.ANONYMOUS_REPORT_RECIPIENTS?.trim();
  if (!configured) return DEFAULT_RECIPIENTS;
  const list = configured
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));
  // An env var set to junk must not silently redirect these to nobody. Falling
  // back is louder than delivering to an empty list, which looks like success.
  return list.length > 0 ? list : DEFAULT_RECIPIENTS;
}

/**
 * HTML-escape. Everything below is member-written text going into an HTML
 * email, and `<` is a character people type, not markup we asked for.
 */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Keep the member's paragraphs. A wall of unbroken text reads as a rant. */
function paragraphs(message: string): string {
  return message
    .split(/\n{2,}/)
    .map((block) => `<p>${esc(block.trim()).replace(/\n/g, "<br />")}</p>`)
    .join("\n");
}

/**
 * Build the note exec receives.
 *
 * What is deliberately NOT in here: a name, an email, a role, a member id, a
 * page path, an IP, a user agent, or anything derived from the session. The
 * route knows all of it — it had to, to check the member was signed in and to
 * count their hourly quota — and none of it is passed to this function, so
 * there is nothing here to leak by accident later.
 *
 * The one identifying thing that can appear is `contact`, which the member
 * typed themselves.
 */
export function anonymousNoteEmail(input: {
  topic: AnonymousTopic;
  message: string;
  contact?: string | null;
  /** When it was sent. Passed in rather than read here, so tests are stable. */
  sentAt?: Date;
}): { subject: string; html: string } {
  const label = topicLabel(input.topic);
  const subject = `[Anonymous] ${label}`;
  const contact = input.contact?.trim().slice(0, MAX_CONTACT);
  const sentAt = input.sentAt ?? new Date();

  const reply = contact
    ? `<p><strong>They left a way to reach them:</strong> ${esc(contact)}</p>
       <p>That line is the only thing here that says who they are, and they chose to add it. Everything else about this note is anonymous.</p>`
    : `<p><strong>There is no way to reply.</strong> The portal does not record who sends these, so nobody — including whoever maintains the site — can tell you who wrote this. If it needs an answer, the answer has to be given to the whole club.</p>`;

  const html = wrapInShell(
    subject,
    `
    <p class="eyebrow">Anonymous note</p>
    <h1>${esc(label)}</h1>
    <blockquote>
      ${paragraphs(input.message)}
    </blockquote>
    ${reply}
    <p style="color:#aaa;font-size:12px;">Sent ${sentAt.toISOString()} from the member portal by a signed-in member. Their identity was never attached to this message.</p>
    `.trim()
  );

  return { subject, html };
}
