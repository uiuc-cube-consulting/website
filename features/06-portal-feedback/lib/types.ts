// Shared shapes for portal feedback. Imported by BOTH the client widget and the
// server route, so nothing here may touch Supabase, `auth`, or node builtins.

/**
 * What the member is telling us. Only two, deliberately: a longer taxonomy just
 * moves the triage decision onto someone who is mid-task and wants to get back
 * to what they were doing. It maps to a GitHub label and nothing else.
 */
export type FeedbackKind = "bug" | "idea";

export const FEEDBACK_KINDS: readonly FeedbackKind[] = ["bug", "idea"];

export function isFeedbackKind(v: unknown): v is FeedbackKind {
  return v === "bug" || v === "idea";
}

/** POST body of /api/feedback. */
export type FeedbackSubmission = {
  kind: FeedbackKind;
  description: string;
  /** Portal path the member was on when they opened the widget, e.g. "/portal/accountability". */
  page_path: string;
  /** `data:image/png;base64,…`, or null when they wrote a note without a shot. */
  screenshot: string | null;
  /** "1512×982" — cheap, and half of "it looks broken" reports are a width. */
  viewport?: string;
};

export const MAX_DESCRIPTION = 4000;

// Screenshots arrive as base64 inside a JSON body, which inflates them ~33%.
// 6 MB of PNG is a 4K screen captured losslessly; the widget downscales and
// re-encodes long before this, so hitting the cap means something unusual is
// being uploaded rather than a normal capture.
export const MAX_SCREENSHOT_BYTES = 6 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type ScreenshotMime = (typeof ALLOWED_IMAGE_TYPES)[number];

export type DecodedScreenshot = { bytes: Uint8Array; mime: ScreenshotMime };

/**
 * Parse the widget's data URL into bytes we are willing to store.
 *
 * This is a trust boundary, not a formatting nicety: the string is composed in
 * the browser by code any member can edit, so the mime type is treated as a
 * CLAIM to be checked against an allowlist rather than as a fact to be echoed
 * back. Whatever survives here is what `/api/feedback/screenshot/[id]` will one
 * day hand a browser with that same `Content-Type`, so an unlisted type — SVG
 * above all, which executes script when served inline — must never get through.
 *
 * Returns a reason rather than throwing: every caller wants to tell the member
 * what was wrong with their image, not to unwind.
 */
export function decodeScreenshot(dataUrl: string): { ok: true; value: DecodedScreenshot } | { ok: false; error: string } {
  const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(dataUrl.trim());
  if (!match) return { ok: false, error: "Screenshot must be a base64 data URL." };

  const mime = match[1].toLowerCase();
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(mime)) {
    return { ok: false, error: "Screenshot must be a PNG, JPEG, or WebP image." };
  }

  // Reject before decoding, not after: base64 is ~4/3 the size of what it
  // encodes, so checking the decoded length would mean materialising an
  // oversized buffer first — which is the thing the cap exists to prevent.
  const base64 = match[2].replace(/\s+/g, "");
  if ((base64.length * 3) / 4 > MAX_SCREENSHOT_BYTES) {
    return { ok: false, error: "Screenshot is too large." };
  }

  let bytes: Uint8Array;
  try {
    const binary = Buffer.from(base64, "base64");
    // Buffer.from is lenient — it stops at the first invalid character and
    // returns the prefix rather than throwing. An empty result is the only
    // signal that the payload was not base64 at all.
    if (binary.length === 0) return { ok: false, error: "Screenshot is empty." };
    bytes = new Uint8Array(binary);
  } catch {
    return { ok: false, error: "Screenshot could not be decoded." };
  }

  return { ok: true, value: { bytes, mime: mime as ScreenshotMime } };
}

/** File extension to store the object under, so downloads keep a sane name. */
export function extensionFor(mime: ScreenshotMime): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "png";
}

/**
 * The issue title, derived from the member's own first line.
 *
 * Not "Feedback from <member>": a list of forty identically-titled issues is
 * unreadable, and the title is the only part visible from the issues index.
 * The member's name is in the body, where it does not cost the one line that
 * has to say what is actually wrong.
 */
export function titleFor(kind: FeedbackKind, description: string): string {
  const firstLine = description.trim().split("\n").find((l) => l.trim().length > 0)?.trim() ?? "";
  const prefix = kind === "bug" ? "Bug" : "Idea";
  if (!firstLine) return `${prefix}: portal feedback`;

  // 72 keeps the title readable in GitHub's list view without an ellipsis of
  // its own. Cut on a word boundary when one is close enough to the limit that
  // the result does not lose a meaningful chunk of the sentence.
  const limit = 72;
  if (firstLine.length <= limit) return `${prefix}: ${firstLine}`;
  const clipped = firstLine.slice(0, limit);
  const lastSpace = clipped.lastIndexOf(" ");
  const stem = lastSpace > limit * 0.6 ? clipped.slice(0, lastSpace) : clipped;
  return `${prefix}: ${stem.replace(/[\s.,;:—-]+$/, "")}…`;
}
