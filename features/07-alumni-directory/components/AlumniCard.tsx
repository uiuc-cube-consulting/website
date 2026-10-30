import { CAMPUS_LABEL, currentRole, formatPhone, needsDirectoryReview, type Alumnus } from "@/features/07-alumni-directory/lib/alumni";

const STATUS_STYLE = {
  on_campus: "bg-emerald-100 text-emerald-800",
  off_campus: "bg-[var(--bg-dark)] text-[var(--fg-on-dark)]",
  unknown: "border border-[var(--border)] bg-white text-[var(--muted)]",
} as const;

const linkClass =
  "inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-[13px] font-semibold text-[var(--bg-dark)] transition-colors hover:border-[var(--gold)]";

/** One alum. `onEdit` is only passed for exec. */
export function AlumniCard({ alumnus: a, onEdit, onReview, now }: { alumnus: Alumnus; onEdit?: () => void; onReview?: () => void; now: number }) {
  const role = currentRole(a);
  // When the headline is shown, the sheet's position/company is usually an
  // older job. Show it as context only when it isn't already in the headline.
  const earlier =
    a.headline && a.company && !a.headline.toLowerCase().includes(a.company.toLowerCase())
      ? [a.position, a.company].filter(Boolean).join(" @ ")
      : null;

  return (
    <article className="flex flex-col rounded-3xl border border-[var(--border)] bg-[var(--bg-cream)] p-6 transition-shadow hover:shadow-xl">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-[var(--brand)]/10 px-2.5 py-1 text-[11px] font-semibold text-[var(--brand-deep)]">{a.membership === "exec" ? "Current exec" : a.membership === "member" ? "Current member" : "Alumni"}</span>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLE[a.campus_status]}`}>
          {CAMPUS_LABEL[a.campus_status]}
        </span>
        {a.open_to_mentor && (
          <span className="rounded-full border border-[var(--gold)]/35 bg-[var(--gold)]/15 px-2.5 py-1 text-[11px] font-semibold text-[var(--gold-deep)]">
            Open to mentoring
          </span>
        )}
      </div>

      <h3 className="mt-3 font-display text-xl font-extrabold leading-tight text-[var(--bg-dark)]">{a.full_name}</h3>

      {role && <p className="mt-2 text-[15px] leading-snug text-[var(--bg-dark)]/85">{role}</p>}
      {earlier && <p className="mt-1 text-[13px] text-[var(--muted)]">Previously {earlier}</p>}
      {a.major && <p className="mt-2 text-[13px] text-[var(--muted)]">{a.major}</p>}
      {!!a.interests?.length && <div className="mt-3 flex flex-wrap gap-1.5">{a.interests.map((interest) => <span key={interest} className="rounded-full bg-white px-2.5 py-1 text-xs text-[var(--brand-deep)]">{interest}</span>)}</div>}
      {!!a.skills?.length && <p className="mt-2 text-xs text-[var(--muted)]">Skills: {a.skills.join(", ")}</p>}
      <div className="mt-4 space-y-1 text-xs text-[var(--muted)]">
        <p>{a.profile_confirmed_at ? `Member-confirmed ${new Date(a.profile_confirmed_at).toLocaleDateString()}` : a.member_id ? "Shared details not confirmed yet" : `Record updated ${new Date(a.updated_at).toLocaleDateString()}`}</p>
        <p>{needsDirectoryReview(a, now) ? "Source check needed" : "LinkedIn & UIUC evidence reviewed"}{a.review && ` · ${new Date(a.review.checked_at).toLocaleDateString()}`}</p>
        {(a.review?.identity_status === "conflict" || a.review?.uiuc_status === "conflict") && <p className="font-semibold text-red-700">Conflicting information — confirm before relying on this record.</p>}
        {a.review?.source_url && <a className="inline-block underline" href={a.review.source_url} target="_blank" rel="noreferrer">Review source ↗</a>}
        {!a.member_id && now - Date.parse(a.updated_at) > 180 * 86400000 && <p>Details may be out of date; ask before assuming a current role.</p>}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
        {a.linkedin_url && (
          <a href={a.linkedin_url} target="_blank" rel="noopener noreferrer" className={linkClass}>
            LinkedIn <span aria-hidden>↗</span>
          </a>
        )}
        {a.email && (
          <a href={`mailto:${a.email}${a.open_to_mentor ? `?subject=${encodeURIComponent("CUBE mentoring / coffee chat")}&body=${encodeURIComponent("Hi,\n\nI'm a fellow CUBE member and would appreciate a brief conversation about your experience. Would you be open to connecting?\n\nThank you!")}` : ""}`} className={linkClass} title={a.email}>
            {a.open_to_mentor ? "Ask about mentoring" : "Email"}
          </a>
        )}
        {a.phone && (
          <a href={`tel:${a.phone.replace(/[^\d+]/g, "")}`} className={linkClass} title={a.phone}>
            {formatPhone(a.phone)}
          </a>
        )}
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="ml-auto text-sm font-semibold text-[var(--gold-deep)] transition-colors hover:text-[var(--bg-dark)]"
          >
            Edit
          </button>
        )}
        {onReview && <button type="button" onClick={onReview} className="text-xs font-semibold text-[var(--brand)] underline">Review sources</button>}
        {a.member_id && !a.linkedin_url && !a.email && <span className="text-xs text-[var(--muted)]">Contact details not shared</span>}
      </div>
    </article>
  );
}
