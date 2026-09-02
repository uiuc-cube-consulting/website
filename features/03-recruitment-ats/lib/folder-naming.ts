// Pure naming for the provisioned Drive tree. No I/O — testable in isolation.
//
// Names matter more here than they look. A folder name is the only handle an
// interviewer has when browsing Drive directly, and it is also what a human
// scans when checking that provisioning did the right thing. Two rules:
//
//   1. Disambiguate. A club recruiting 200 people from one university WILL get
//      two people with the same name. The email is appended so the folder is
//      unique and the tie is obvious to a human, not silently resolved.
//   2. Stay stable. The name is derived only from data that never changes for a
//      candidate (their name + email), so a re-run finds the existing folder by
//      name instead of creating a second one.

/** Characters Drive tolerates but that make folders miserable to script against:
 *  path separators, shell metacharacters, and the control characters a pasted
 *  form response can carry invisibly. */
const UNSAFE = /[\\/:*?"<>|\u0000-\u001F]/g;

/** Collapse whitespace and strip characters that break paths and shell quoting. */
export function sanitize(raw: string): string {
  return String(raw ?? "")
    .replace(UNSAFE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Trim to `max` characters without cutting mid-word where avoidable. Drive's own
 * limit is far higher, but very long names wrap badly in the Drive UI and in our
 * own report output.
 */
function clamp(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim();
}

/**
 * The per-candidate folder name: `Jane Doe — jane@illinois.edu`.
 *
 * The em dash is deliberate — it never appears in a name or an email, so the
 * name can be split back apart unambiguously when auditing the tree.
 * Falls back to the email alone when the name is missing, and to the file-safe
 * literal "Unnamed candidate" when both are, so provisioning never produces an
 * empty or unnamed folder.
 */
export function candidateFolderName(name: string, email: string): string {
  const n = clamp(sanitize(name), 80);
  const e = sanitize(email).toLowerCase();
  if (n && e) return `${n} — ${e}`;
  return n || e || "Unnamed candidate";
}

/**
 * `Case Rubric — Jane Doe.pdf` — a copied file, named for the candidate and
 * keeping the source file's extension.
 *
 * The extension comes from the source rather than being assumed: the rubric
 * masters are PDFs today, but the club swaps them for Google Docs or .docx
 * between cycles, and a copy called "…Rubric — Jane Doe.pdf" that is really a
 * Doc is the kind of thing nobody notices until it will not open.
 */
export function copyFileName(label: string, name: string, originalName?: string | null): string {
  const n = clamp(sanitize(name), 80) || "Candidate";
  const ext = /\.([a-z0-9]{1,5})$/i.exec(String(originalName ?? ""))?.[1];
  const base = `${sanitize(label)} — ${n}`;
  return ext ? `${base}.${ext.toLowerCase()}` : base;
}

/** `Resume — Jane Doe.pdf`, preserving the original file's extension. */
export function resumeFileName(name: string, originalName?: string | null): string {
  return copyFileName("Resume", name, originalName);
}

/** `Case Rubric — Jane Doe`. Google Docs carry no extension. */
export function docTitle(label: string, name: string): string {
  const n = clamp(sanitize(name), 80) || "Candidate";
  return `${sanitize(label)} — ${n}`;
}

/**
 * The cycle subfolder (`Fall 2026`) that every candidate folder lives under.
 * Keeping cycles as sibling folders means last year's tree stays browsable and
 * a new cycle never collides with an old one.
 */
export function cycleFolderName(label: string | undefined | null): string {
  return sanitize(label ?? "") || "Current cycle";
}
