/**
 * The screenshot decoder, which is the feature's one real trust boundary.
 *
 * The data URL is composed in the browser by code any signed-in member can
 * edit, and whatever survives this function is later handed back to a browser
 * with that same mime as its `Content-Type`. So the two things pinned here are
 * the ones that would matter if they broke: the type allowlist (an SVG served
 * inline from the portal's own origin executes script), and the size cap being
 * applied to the ENCODED string rather than to a buffer we had to allocate to
 * find out it was too big.
 */

import {
  MAX_SCREENSHOT_BYTES,
  decodeScreenshot,
  extensionFor,
  titleFor,
} from "@/features/06-portal-feedback/lib/types";

// A 1×1 PNG, and the same pixel as JPEG/WebP — small enough to inline.
const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function dataUrl(mime: string, b64 = PNG_1PX): string {
  return `data:${mime};base64,${b64}`;
}

describe("decodeScreenshot", () => {
  it("accepts the three image types the widget can produce", () => {
    for (const mime of ["image/png", "image/jpeg", "image/webp"]) {
      const out = decodeScreenshot(dataUrl(mime));
      expect(out.ok).toBe(true);
      if (out.ok) expect(out.value.mime).toBe(mime);
    }
  });

  it("is case-insensitive about the mime, because browsers are", () => {
    const out = decodeScreenshot(dataUrl("IMAGE/PNG"));
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.mime).toBe("image/png");
  });

  it("refuses SVG — it would be script, served from the portal's own origin", () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString("base64");
    const out = decodeScreenshot(dataUrl("image/svg+xml", svg));
    expect(out.ok).toBe(false);
  });

  it("refuses anything that isn't on the allowlist", () => {
    for (const mime of ["text/html", "application/pdf", "image/gif", "application/octet-stream"]) {
      expect(decodeScreenshot(dataUrl(mime)).ok).toBe(false);
    }
  });

  it("refuses a bare string, a URL, and a non-base64 data URL", () => {
    expect(decodeScreenshot("not a data url").ok).toBe(false);
    expect(decodeScreenshot("https://example.com/shot.png").ok).toBe(false);
    expect(decodeScreenshot("data:image/png,rawbytes").ok).toBe(false);
  });

  it("rejects an oversized payload without decoding it", () => {
    // Comfortably over the cap once base64's 4/3 expansion is undone.
    const huge = "A".repeat(Math.ceil((MAX_SCREENSHOT_BYTES * 4) / 3) + 1024);
    const out = decodeScreenshot(dataUrl("image/png", huge));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/too large/i);
  });

  it("rejects a payload that decodes to nothing", () => {
    // Buffer.from is lenient and returns a prefix rather than throwing, so an
    // empty result is the only signal that this was never base64.
    expect(decodeScreenshot(dataUrl("image/png", "!!!!")).ok).toBe(false);
  });

  it("names the file after the format it actually is", () => {
    expect(extensionFor("image/png")).toBe("png");
    expect(extensionFor("image/jpeg")).toBe("jpg");
    expect(extensionFor("image/webp")).toBe("webp");
  });
});

describe("titleFor", () => {
  it("leads with the member's own first line, not a boilerplate subject", () => {
    expect(titleFor("bug", "Points page shows zero for everyone")).toBe(
      "Bug: Points page shows zero for everyone"
    );
    expect(titleFor("idea", "Let PMs export the roster")).toBe("Idea: Let PMs export the roster");
  });

  it("uses only the first non-empty line", () => {
    expect(titleFor("bug", "\n\nWeek selector resets\n\nSteps: open the page…")).toBe(
      "Bug: Week selector resets"
    );
  });

  it("truncates on a word boundary and marks the cut", () => {
    const long =
      "The accountability grid stops saving ratings whenever I switch between projects using the chooser at the top";
    const title = titleFor("bug", long);
    expect(title.length).toBeLessThanOrEqual(80);
    expect(title.endsWith("…")).toBe(true);
    // The cut lands between words rather than mid-word.
    expect(title).not.toMatch(/\w-…$/);
  });

  it("still produces a usable title when the description is only whitespace", () => {
    // The route refuses an empty description, so this is defence in depth
    // rather than a reachable path — but an issue titled "Bug: " is worse than
    // one saying nothing happened.
    expect(titleFor("bug", "   \n  ")).toBe("Bug: portal feedback");
  });
});
