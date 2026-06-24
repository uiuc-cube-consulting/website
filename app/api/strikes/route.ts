import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createServerClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import { computeStrikeTotal } from "@/lib/strikes";
import {
  approvalTemplate,
  requesterApprovalTemplate,
  execAlertTemplate,
} from "@/lib/email/strikes";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { memberId, role } = session.user;
  const supabase = createServerClient();
  const params = req.nextUrl.searchParams;
  const filterMemberId = params.get("member_id");
  const summary = params.get("summary") === "true";

  // Strike total summary (exec only)
  if (summary && filterMemberId) {
    if (role !== "exec") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { data } = await supabase
      .from("strikes")
      .select("effective_type, status")
      .eq("member_id", filterMemberId);
    const total = computeStrikeTotal(data ?? []);
    return NextResponse.json({ total });
  }

  if (role === "exec") {
    const query = supabase
      .from("strikes")
      .select(`
        *,
        member:member_id ( id, full_name, email ),
        filer:filed_by ( id, full_name, email ),
        resolver:resolved_by ( id, full_name, email )
      `)
      .order("created_at", { ascending: false });

    if (filterMemberId) query.eq("member_id", filterMemberId);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ strikes: data ?? [] });
  }

  if (role === "project_manager" || role === "senior_consultant") {
    // Their filed requests
    const { data: filed } = await supabase
      .from("strikes")
      .select(`
        *,
        member:member_id ( id, full_name, email )
      `)
      .eq("filed_by", memberId)
      .order("created_at", { ascending: false });

    // Their own received approved strikes
    const { data: received } = await supabase
      .from("strikes")
      .select("id, strike_type, effective_type, reason, status, created_at")
      .eq("member_id", memberId)
      .eq("status", "approved")
      .order("created_at", { ascending: false });

    return NextResponse.json({ filed: filed ?? [], received: received ?? [] });
  }

  // Regular member — own approved strikes only
  const { data, error } = await supabase
    .from("strikes")
    .select("id, strike_type, effective_type, reason, status, created_at")
    .eq("member_id", memberId)
    .eq("status", "approved")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ received: data ?? [] });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.memberId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { memberId, role, name: filerName, email: filerEmail } = session.user;

  // Any signed-in member may FILE a strike. Non-exec strikes are created as
  // "pending" (below) and only the exec board can review/approve them.

  const body = await req.json();
  const { target_member_id, strike_type, reason, email_subject, email_body } = body;

  if (!target_member_id || !strike_type || !reason) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!["half", "full"].includes(strike_type)) {
    return NextResponse.json({ error: "Invalid strike_type" }, { status: 400 });
  }

  const supabase = createServerClient();

  // Fetch target member info
  const { data: targetMember } = await supabase
    .from("members")
    .select("id, full_name, email")
    .eq("id", target_member_id)
    .single();

  if (!targetMember) {
    return NextResponse.json({ error: "Target member not found" }, { status: 404 });
  }

  const isExec = role === "exec";
  const now = new Date().toISOString();

  const insertData = {
    member_id: target_member_id,
    filed_by: memberId,
    strike_type,
    effective_type: isExec ? strike_type : null,
    reason,
    status: isExec ? "approved" : "pending",
    resolved_at: isExec ? now : null,
    resolved_by: isExec ? memberId : null,
  };

  const { data: strike, error } = await supabase
    .from("strikes")
    .insert(insertData)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Send emails for exec-filed (immediately approved) strikes
  if (isExec && email_subject && email_body) {
    const { data: allStrikes } = await supabase
      .from("strikes")
      .select("effective_type, status")
      .eq("member_id", target_member_id);

    const newTotal = computeStrikeTotal(allStrikes ?? []);

    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromAddress = "CUBE Consulting <hr@cubeconsulting.org>";

    // Email to struck member (exec-edited content)
    await resend.emails.send({
      from: fromAddress,
      to: targetMember.email,
      subject: email_subject,
      html: email_body,
    });

    // 3-strike exec alert
    if (newTotal >= 3) {
      const { data: execMembers } = await supabase
        .from("members")
        .select("email")
        .eq("role", "exec");

      if (execMembers && execMembers.length > 0) {
        const alert = execAlertTemplate(targetMember.full_name);
        await resend.emails.send({
          from: fromAddress,
          to: execMembers.map((m) => m.email),
          subject: alert.subject,
          html: alert.html,
        });
      }
    }
  }

  return NextResponse.json({ strike }, { status: 201 });
}
