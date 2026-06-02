import { strikeLabel } from "@/lib/strikes";

type EmailTemplate = { subject: string; html: string };

function base(title: string, body: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f4f0; margin: 0; padding: 32px 16px; }
    .card { max-width: 560px; margin: 0 auto; background: #fff; border-radius: 16px; border: 1px solid #e5e3dc; padding: 36px 40px; }
    .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #b59a5a; margin: 0 0 12px; }
    h1 { font-size: 22px; font-weight: 800; color: #1a1a2e; margin: 0 0 20px; }
    p { font-size: 15px; line-height: 1.65; color: #555; margin: 0 0 16px; }
    .detail { background: #f5f4f0; border-radius: 10px; padding: 16px 20px; margin: 20px 0; }
    .detail p { margin: 4px 0; font-size: 14px; }
    .detail strong { color: #1a1a2e; }
    .footer { margin-top: 28px; padding-top: 20px; border-top: 1px solid #e5e3dc; font-size: 12px; color: #aaa; }
  </style>
</head>
<body>
  <div class="card">
    <p class="eyebrow">CUBE Consulting</p>
    ${body}
    <div class="footer">This is an automated message from the CUBE Consulting member portal. Do not reply to this email.</div>
  </div>
</body>
</html>
`.trim();
}

// ── Struck member: approval ──────────────────────────────────────────────────

export function approvalTemplate(
  memberName: string,
  reason: string,
  newTotal: number
): EmailTemplate {
  const label = strikeLabel(newTotal);
  const subject = `[CUBE] Strike Notice — ${label}`;
  const html = base(
    subject,
    `<h1>Strike Notice: ${label}</h1>
    <p>Hi ${memberName},</p>
    <p>A strike has been issued against your membership record.</p>
    <div class="detail">
      <p><strong>Strike level:</strong> ${label}</p>
      <p><strong>Reason:</strong> ${reason}</p>
    </div>
    <p>If you have questions or would like to appeal, please reach out to the executive board.</p>`
  );
  return { subject, html };
}

// ── Struck member: void ──────────────────────────────────────────────────────

export function voidTemplate(
  memberName: string,
  newTotal: number
): EmailTemplate {
  const label = newTotal > 0 ? strikeLabel(newTotal) : "0 strikes";
  const subject = `[CUBE] Strike Voided — Updated Record`;
  const html = base(
    subject,
    `<h1>Strike Voided</h1>
    <p>Hi ${memberName},</p>
    <p>A strike on your membership record has been voided following a review by the executive board.</p>
    <div class="detail">
      <p><strong>Updated strike total:</strong> ${label}</p>
    </div>
    <p>If you have any questions, please contact the executive board.</p>`
  );
  return { subject, html };
}

// ── Struck member: downgrade ─────────────────────────────────────────────────

export function downgradeTemplate(
  memberName: string,
  newTotal: number
): EmailTemplate {
  const label = strikeLabel(newTotal);
  const subject = `[CUBE] Strike Downgraded — Updated Record`;
  const html = base(
    subject,
    `<h1>Strike Downgraded</h1>
    <p>Hi ${memberName},</p>
    <p>A full strike on your membership record has been downgraded to a half strike following a review by the executive board.</p>
    <div class="detail">
      <p><strong>Updated strike total:</strong> ${label}</p>
    </div>
    <p>If you have any questions, please contact the executive board.</p>`
  );
  return { subject, html };
}

// ── Struck member: upgrade ───────────────────────────────────────────────────

export function upgradeTemplate(
  memberName: string,
  newTotal: number
): EmailTemplate {
  const label = strikeLabel(newTotal);
  const subject = `[CUBE] Strike Upgraded — Updated Record`;
  const html = base(
    subject,
    `<h1>Strike Upgraded</h1>
    <p>Hi ${memberName},</p>
    <p>A half strike on your membership record has been upgraded to a full strike following a review by the executive board.</p>
    <div class="detail">
      <p><strong>Updated strike total:</strong> ${label}</p>
    </div>
    <p>If you have any questions, please contact the executive board.</p>`
  );
  return { subject, html };
}

// ── Requester: approval ──────────────────────────────────────────────────────

export function requesterApprovalTemplate(
  requesterName: string,
  targetName: string,
  weight: string
): EmailTemplate {
  const subject = `[CUBE] Strike Request Approved — ${targetName}`;
  const html = base(
    subject,
    `<h1>Strike Request Approved</h1>
    <p>Hi ${requesterName},</p>
    <p>Your strike request has been reviewed and approved by the executive board.</p>
    <div class="detail">
      <p><strong>Member:</strong> ${targetName}</p>
      <p><strong>Strike weight:</strong> ${weight}</p>
    </div>`
  );
  return { subject, html };
}

// ── Requester: denial ────────────────────────────────────────────────────────

export function requesterDenialTemplate(
  requesterName: string,
  targetName: string,
  weight: string
): EmailTemplate {
  const subject = `[CUBE] Strike Request Denied — ${targetName}`;
  const html = base(
    subject,
    `<h1>Strike Request Denied</h1>
    <p>Hi ${requesterName},</p>
    <p>Your strike request has been reviewed and denied by the executive board.</p>
    <div class="detail">
      <p><strong>Member:</strong> ${targetName}</p>
      <p><strong>Requested weight:</strong> ${weight}</p>
    </div>
    <p>If you believe this decision is incorrect, please reach out to the executive board directly.</p>`
  );
  return { subject, html };
}

// ── Requester: void ──────────────────────────────────────────────────────────

export function requesterVoidTemplate(
  requesterName: string,
  targetName: string
): EmailTemplate {
  const subject = `[CUBE] Strike Voided — ${targetName}`;
  const html = base(
    subject,
    `<h1>Strike Voided</h1>
    <p>Hi ${requesterName},</p>
    <p>A strike you previously filed against ${targetName} has been voided by the executive board.</p>
    <p>If you have questions about this decision, please contact the executive board.</p>`
  );
  return { subject, html };
}

// ── Requester: downgrade ─────────────────────────────────────────────────────

export function requesterDowngradeTemplate(
  requesterName: string,
  targetName: string
): EmailTemplate {
  const subject = `[CUBE] Strike Downgraded — ${targetName}`;
  const html = base(
    subject,
    `<h1>Strike Downgraded</h1>
    <p>Hi ${requesterName},</p>
    <p>A full strike you previously filed against ${targetName} has been downgraded to a half strike by the executive board.</p>
    <p>If you have questions about this decision, please contact the executive board.</p>`
  );
  return { subject, html };
}

// ── Requester: upgrade ───────────────────────────────────────────────────────

export function requesterUpgradeTemplate(
  requesterName: string,
  targetName: string
): EmailTemplate {
  const subject = `[CUBE] Strike Upgraded — ${targetName}`;
  const html = base(
    subject,
    `<h1>Strike Upgraded</h1>
    <p>Hi ${requesterName},</p>
    <p>A half strike you previously filed against ${targetName} has been upgraded to a full strike by the executive board.</p>
    <p>If you have questions about this decision, please contact the executive board.</p>`
  );
  return { subject, html };
}

// ── Exec alert: 3 strikes ────────────────────────────────────────────────────

export function execAlertTemplate(targetName: string): EmailTemplate {
  const subject = `[CUBE] ⚠ 3-Strike Threshold Reached — ${targetName}`;
  const html = base(
    subject,
    `<h1>3-Strike Threshold Reached</h1>
    <p>This is an automated alert.</p>
    <p><strong>${targetName}</strong> has reached <strong>3 total strikes</strong>.</p>
    <p>Please review their record in the member portal and take appropriate action. Account locking must be performed manually by an exec member.</p>`
  );
  return { subject, html };
}
