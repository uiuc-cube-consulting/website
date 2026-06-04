import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createServerClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { computeStrikeTotal } from "@/lib/strikes";
import {
  voidTemplate,
  downgradeTemplate,
  upgradeTemplate,
  requesterDenialTemplate,
  requesterVoidTemplate,
  requesterDowngradeTemplate,
  requesterUpgradeTemplate,
  execAlertTemplate,
} from "@/lib/email/strikes";

export const dynamic = "force-dynamic";

type Action = "approve" | "deny" | "void" | "downgrade" | "upgrade";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "exec") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const {
    action,
    email_subject,
    email_body,
    requester_email_subject,
    requester_email_body,
  }: {
    action: Action;
    email_subject?: string;
    email_body?: string;
    requester_email_subject?: string;
    requester_email_body?: string;
  } = body;

  if (!["approve", "deny", "void", "downgrade", "upgrade"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const supabase = createServerClient();
  const resolverMemberId = session.user.memberId;
  const now = new Date().toISOString();

  // Fetch the strike with joined member + filer data
  const { data: strike, error: fetchErr } = await supabase
    .from("strikes")
    .select(`
      *,
      member:member_id ( id, full_name, email ),
      filer:filed_by ( id, full_name, email )
    `)
    .eq("id", id)
    .single();

  if (fetchErr || !strike) {
    return NextResponse.json({ error: "Strike not found" }, { status: 404 });
  }

  // Validate action against current state
  if (action === "approve" || action === "deny") {
    if (strike.status !== "pending") {
      return NextResponse.json({ error: "Strike is not pending" }, { status: 400 });
    }
  }
  if (action === "void" || action === "downgrade" || action === "upgrade") {
    if (strike.status !== "approved" || strike.effective_type === "voided") {
      return NextResponse.json({ error: "Cannot modify this strike" }, { status: 400 });
    }
  }
  if (action === "downgrade" && strike.effective_type !== "full") {
    return NextResponse.json({ error: "Can only downgrade a full strike" }, { status: 400 });
  }
  if (action === "upgrade" && strike.effective_type !== "half") {
    return NextResponse.json({ error: "Can only upgrade a half strike" }, { status: 400 });
  }

  // Build update payload
  type UpdatePayload = {
    status?: string;
    effective_type?: string;
    resolved_at?: string;
    resolved_by?: string;
  };

  const update: UpdatePayload = { resolved_at: now, resolved_by: resolverMemberId };

  if (action === "approve") {
    update.status = "approved";
    update.effective_type = strike.strike_type;
  } else if (action === "deny") {
    update.status = "denied";
  } else if (action === "void") {
    update.effective_type = "voided";
  } else if (action === "downgrade") {
    update.effective_type = "half";
  } else if (action === "upgrade") {
    update.effective_type = "full";
  }

  const { data: updated, error: updateErr } = await supabase
    .from("strikes")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Send emails
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = "CUBE Consulting <noreply@cubeconsulting.org>";
  const targetEmail = strike.member.email;
  const targetName = strike.member.full_name;
  const filerEmail = strike.filer.email;
  const filerName = strike.filer.full_name;
  const samePersonAsResolver = strike.filed_by === resolverMemberId;

  // Fetch updated totals for struck-member emails
  const { data: allStrikes } = await supabase
    .from("strikes")
    .select("effective_type, status")
    .eq("member_id", strike.member_id);

  // Apply the local update so computeStrikeTotal reflects the just-made change
  const updatedRows = (allStrikes ?? []).map(
    (r: { effective_type: string | null; status: string }) => r
  ) as { effective_type: "half" | "full" | "voided" | null; status: "pending" | "approved" | "denied" }[];
  const newTotal = computeStrikeTotal(updatedRows);

  const emailPromises: Promise<unknown>[] = [];

  if (action === "approve") {
    // Struck member — exec-edited subject/body
    if (email_subject && email_body) {
      emailPromises.push(
        resend.emails.send({ from, to: targetEmail, subject: email_subject, html: email_body })
      );
    }
    // Requester
    if (requester_email_subject && requester_email_body) {
      emailPromises.push(
        resend.emails.send({ from, to: filerEmail, subject: requester_email_subject, html: requester_email_body })
      );
    }
    // 3-strike alert
    if (newTotal >= 3) {
      const { data: execMembers } = await supabase
        .from("members")
        .select("email")
        .eq("role", "exec");
      if (execMembers?.length) {
        const alert = execAlertTemplate(targetName);
        emailPromises.push(
          resend.emails.send({ from, to: execMembers.map((m: { email: string }) => m.email), subject: alert.subject, html: alert.html })
        );
      }
    }
  } else if (action === "deny") {
    if (requester_email_subject && requester_email_body) {
      emailPromises.push(
        resend.emails.send({ from, to: filerEmail, subject: requester_email_subject, html: requester_email_body })
      );
    }
  } else if (action === "void") {
    if (email_subject && email_body) {
      emailPromises.push(
        resend.emails.send({ from, to: targetEmail, subject: email_subject, html: email_body })
      );
    }
    if (!samePersonAsResolver && requester_email_subject && requester_email_body) {
      emailPromises.push(
        resend.emails.send({ from, to: filerEmail, subject: requester_email_subject, html: requester_email_body })
      );
    }
  } else if (action === "downgrade") {
    if (email_subject && email_body) {
      emailPromises.push(
        resend.emails.send({ from, to: targetEmail, subject: email_subject, html: email_body })
      );
    }
    if (!samePersonAsResolver && requester_email_subject && requester_email_body) {
      emailPromises.push(
        resend.emails.send({ from, to: filerEmail, subject: requester_email_subject, html: requester_email_body })
      );
    }
  } else if (action === "upgrade") {
    if (email_subject && email_body) {
      emailPromises.push(
        resend.emails.send({ from, to: targetEmail, subject: email_subject, html: email_body })
      );
    }
    if (!samePersonAsResolver && requester_email_subject && requester_email_body) {
      emailPromises.push(
        resend.emails.send({ from, to: filerEmail, subject: requester_email_subject, html: requester_email_body })
      );
    }
  }

  await Promise.allSettled(emailPromises);

  return NextResponse.json({ strike: updated });
}
