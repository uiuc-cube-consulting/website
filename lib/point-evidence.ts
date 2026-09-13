// Photo evidence for a point submission: the server-side check on what gets
// stored. Uses Buffer, so never import this from client code.
//
// The photo arrives as a data URL composed in the browser by code any member
// can edit, so its declared type is a CLAIM. Whatever passes here is later
// served back inline from the portal's own origin by
// /api/points/submissions/[id]/evidence, which is why the type is allowlisted
// AND checked against the file's leading bytes: an SVG or HTML payload labelled
// image/png must never get through.

// The form re-encodes photos to ~1600px JPEGs, typically well under 1 MB. The
// cap sits below Vercel's 4.5 MB request limit once base64 inflation (~4/3) is
// counted, so an oversized upload gets this message rather than a bare 413.
export const MAX_EVIDENCE_BYTES = 3 * 1024 * 1024;

export const EVIDENCE_MIMES = ["image/png", "image/jpeg", "image/webp"] as const;
export type EvidenceMime = (typeof EVIDENCE_MIMES)[number];

export type DecodedEvidence =
  | { ok: true; bytes: Uint8Array; mime: EvidenceMime }
  | { ok: false; error: string };

export function isEvidenceMime(value: unknown): value is EvidenceMime {
  return typeof value === "string" && (EVIDENCE_MIMES as readonly string[]).includes(value);
}

function startsWith(bytes: Uint8Array, prefix: number[], offset = 0): boolean {
  return prefix.every((b, i) => bytes[offset + i] === b);
}

function matchesSignature(bytes: Uint8Array, mime: EvidenceMime): boolean {
  if (mime === "image/png") return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47]);
  if (mime === "image/jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff]);
  // RIFF....WEBP
  return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8);
}

export function decodeEvidence(dataUrl: unknown): DecodedEvidence {
  if (typeof dataUrl !== "string" || !dataUrl.trim()) {
    return { ok: false, error: "Attach a photo of you at the event." };
  }

  const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([\s\S]+)$/i.exec(dataUrl.trim());
  if (!match) return { ok: false, error: "The photo couldn't be read. Try attaching it again." };

  const mime = match[1].toLowerCase();
  if (!isEvidenceMime(mime)) {
    return { ok: false, error: "The photo must be a JPEG, PNG, or WebP image." };
  }

  // Checked before decoding so an oversized payload is never materialised.
  const base64 = match[2].replace(/\s+/g, "");
  if ((base64.length * 3) / 4 > MAX_EVIDENCE_BYTES) {
    return { ok: false, error: "That photo is too large. Try a smaller one." };
  }

  // Buffer.from is lenient: it stops at the first invalid character instead of
  // throwing, so an empty result is the signal that this wasn't base64.
  const bytes = new Uint8Array(Buffer.from(base64, "base64"));
  if (bytes.length === 0 || !matchesSignature(bytes, mime)) {
    return { ok: false, error: "The photo couldn't be read. Try attaching it again." };
  }

  return { ok: true, bytes, mime };
}

export function extensionFor(mime: EvidenceMime): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/webp") return "webp";
  return "png";
}
