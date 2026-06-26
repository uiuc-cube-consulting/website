import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createServerClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { computeStrikeTotal, weightLabel } from "@/lib/strikes";
import {
  approvalTemplate,
  voidTemplate,
  downgradeTemplate,
  upgradeTemplate,
  requesterApprovalTemplate,
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
  const { action }: { action: Action } = body;

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

  // Best-effort notifications, generated server-side from templates. Guarded by
  // RESEND_API_KEY + try/catch so an email failure never fails the resolve action —
  // the strike has already been updated above.
  if (process.env.RESEND_API_KEY) {
    try {
      const { data: allStrikes } = await supabase
        .from("strikes")
        .select("effective_type, status")
        .eq("member_id", strike.member_id);
      const newTotal = computeStrikeTotal(
        (allStrikes ?? []) as {
          effective_type: "half" | "full" | "voided" | null;
          status: "pending" | "approved" | "denied";
        }[]
      );

      const resend = new Resend(process.env.RESEND_API_KEY);
      const from = "CUBE Consulting <noreply@cubeconsulting.org>";
      const targetEmail = strike.member.email as string;
      const targetName = strike.member.full_name as string;
      const filerEmail = strike.filer?.email as string | undefined;
      const filerName = (strike.filer?.full_name as string | undefined) ?? "there";
      const notifyFiler = strike.filed_by !== resolverMemberId && Boolean(filerEmail);
      const weight = weightLabel(strike.strike_type as "half" | "full");

      const sends: Promise<unknown>[] = [];
      const send = (to: string | string[], t: { subject: string; html: string }) =>
        sends.push(resend.emails.send({ from, to, subject: t.subject, html: t.html }));

      if (action === "approve") {
        send(targetEmail, approvalTemplate(targetName, strike.reason, newTotal));
        if (notifyFiler) send(filerEmail!, requesterApprovalTemplate(filerName, targetName, weight));
        if (newTotal >= 3) {
          const { data: execMembers } = await supabase.from("members").select("email").eq("role", "exec");
          if (execMembers?.length) send(execMembers.map((m: { email: string }) => m.email), execAlertTemplate(targetName));
        }
      } else if (action === "deny") {
        if (notifyFiler) send(filerEmail!, requesterDenialTemplate(filerName, targetName, weight));
      } else if (action === "void") {
        send(targetEmail, voidTemplate(targetName, newTotal));
        if (notifyFiler) send(filerEmail!, requesterVoidTemplate(filerName, targetName));
      } else if (action === "downgrade") {
        send(targetEmail, downgradeTemplate(targetName, newTotal));
        if (notifyFiler) send(filerEmail!, requesterDowngradeTemplate(filerName, targetName));
      } else if (action === "upgrade") {
        send(targetEmail, upgradeTemplate(targetName, newTotal));
        if (notifyFiler) send(filerEmail!, requesterUpgradeTemplate(filerName, targetName));
      }

      await Promise.allSettled(sends);
    } catch (e) {
      console.error("Strike resolve email failed (non-fatal):", e);
    }
  }

  return NextResponse.json({ strike: updated });
}
