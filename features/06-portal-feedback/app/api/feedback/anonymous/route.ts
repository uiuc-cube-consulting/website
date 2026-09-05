import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { sendEmail } from "@/lib/email/send";
import { anonymousNoteEmail, anonymousRecipients } from "@/features/06-portal-feedback/lib/anonymous-email";
import { checkQuota, recordSend } from "@/features/06-portal-feedback/lib/anonymous-store";
import {
  MAX_CONTACT,
  MAX_MESSAGE,
  isAnonymousTopic,
} from "@/features/06-portal-feedback/lib/anonymous";

// A member's note to the exec board, with nothing on it that says who they are.
//
// The session is required and then thrown away. That reads like a contradiction
// and is not: signing in proves a CUBE member is writing, which is what makes
// the note worth reading and what keeps the internet out of two exec inboxes.
// The address is used for exactly two things — proving membership, and counting
// this hour's notes as a one-way hash — and is never passed to the code that
// builds the email. See lib/anonymous-email.ts, which is not given it at all.
//
// Nothing is stored. There is no row holding what was written, because the
// email IS the artifact and a database copy of an anonymous report is one more
// place it can be read from. If the send fails, the member is told so and their
// text is still in the box.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  // Ahead of parsing, like the feedback widget's ceiling: the point is to stop
  // a run of emails reaching two people, so it sits in front of the work.
  const quota = await checkQuota(email);
  if (!quota.allowed) {
    return NextResponse.json(
      {
        ok: false,
        error: `You've sent ${quota.sent} notes in the last hour. Give it a little while — they've all gone through.`,
      },
      { status: 429 }
    );
  }

  let body: { topic?: unknown; message?: unknown; contact?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!isAnonymousTopic(body.topic)) {
    return NextResponse.json({ ok: false, error: "Pick what this is about." }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ ok: false, error: "Write something first." }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE) {
    return NextResponse.json(
      { ok: false, error: `Keep it under ${MAX_MESSAGE} characters.` },
      { status: 400 }
    );
  }

  // Whatever the member typed, and only that. The session's address is
  // deliberately not a fallback here: an empty box means "don't reply to me",
  // and helpfully filling it in would break the promise the page makes.
  const contact =
    typeof body.contact === "string" && body.contact.trim()
      ? body.contact.trim().slice(0, MAX_CONTACT)
      : null;

  const { subject, html } = anonymousNoteEmail({ topic: body.topic, message, contact });
  const to = anonymousRecipients();

  try {
    await sendEmail({ to, subject, html });
  } catch (e) {
    // Logged without the member, the message, or the contact line — a server
    // log is a place this note has no business appearing.
    console.error("[anonymous] send failed:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      {
        ok: false,
        error:
          "The email didn't go through, so nobody has this yet. Your note is still in the box — try again in a moment.",
      },
      { status: 502 }
    );
  }

  // Only after it actually went out. A failed send that still burned a slot
  // would punish someone for the mail server having a bad minute.
  await recordSend(email);

  // `to` is echoed so the confirmation can name the inboxes it landed in. The
  // member is entitled to know exactly who is about to read this.
  return NextResponse.json({ ok: true, recipients: to });
}
