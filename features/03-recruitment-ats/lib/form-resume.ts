// Pure parsing of Drive links out of a Google Form response cell. No I/O, no
// imports — testable in isolation and safe to import anywhere.
//
// A Form file-upload question writes the uploaded file's Drive URL into the
// response sheet. This is the single most valuable thing about form intake: it
// is an AUTHORITATIVE candidate -> file mapping. The four fuzzy filename tiers
// in resume-match.ts exist only because resumes used to arrive as a flat folder
// of arbitrarily named files; nothing here needs to guess.
//
// Google is not consistent about which URL shape it writes — it varies by how
// the upload happened and has changed over time — so we accept all of them.
// A question that accepts multiple files writes several URLs in one cell,
// separated by a comma (and sometimes wrapped across newlines).

/** Drive file ids are the usual base64url-ish alphabet. Length varies (~28-44). */
const ID = "[a-zA-Z0-9_-]{10,}";

// Ordered most- to least-specific. `open?id=` and `uc?id=` are the shapes Google
// Forms itself writes; `/file/d/<id>/` is what a human pasting a share link gives.
const URL_PATTERNS = [
  new RegExp(`/file/d/(${ID})`),
  new RegExp(`[?&]id=(${ID})`),
  new RegExp(`/folderview\\?.*[?&]id=(${ID})`),
  new RegExp(`/document/d/(${ID})`),
  new RegExp(`/drive/.*?/(${ID})`),
];

/** A bare id pasted with no URL around it. Kept strict so prose isn't mistaken for an id. */
const BARE_ID = new RegExp(`^${ID}$`);

/**
 * One cell -> the Drive file ids it references, in the order they appear,
 * deduped. Returns [] for an empty cell or one holding no recognizable link,
 * which the caller should treat as "no resume", never as an error.
 */
export function parseDriveIds(cell: string | null | undefined): string[] {
  const raw = String(cell ?? "").trim();
  if (!raw) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  const add = (id: string | undefined) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };

  // Split on comma/newline/whitespace runs. Filenames can contain spaces, but
  // URLs cannot, so splitting on whitespace is safe for the link itself.
  for (const part of raw.split(/[,\n\r\t]+|\s{2,}/)) {
    const token = part.trim();
    if (!token) continue;

    if (BARE_ID.test(token)) {
      add(token);
      continue;
    }
    for (const re of URL_PATTERNS) {
      const m = re.exec(token);
      if (m) {
        add(m[1]);
        break;
      }
    }
  }

  // A single cell that held one long URL with spaces around other text still
  // needs a look — fall back to scanning the whole string.
  if (out.length === 0) {
    for (const re of URL_PATTERNS) {
      const m = re.exec(raw);
      if (m) {
        add(m[1]);
        break;
      }
    }
  }

  return out;
}

/**
 * The single resume for a candidate. When a question accepted several files we
 * take the FIRST — Forms writes them in upload order, and re-uploading to fix a
 * mistake appends rather than replaces, so first is the one they meant to send.
 * Callers that care about the extras can use `parseDriveIds` directly.
 */
export function parseResumeId(cell: string | null | undefined): string | null {
  return parseDriveIds(cell)[0] ?? null;
}

/** Canonical viewer URL for a Drive file id. */
export function driveFileUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

/** Canonical viewer URL for a Drive folder id. */
export function driveFolderUrl(folderId: string): string {
  return `https://drive.google.com/drive/folders/${folderId}`;
}
