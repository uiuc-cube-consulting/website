// Browser-only image handling for the feedback widget: grab a frame from a
// screen-share stream, or normalise a pasted/uploaded file, and hand back a
// data URL small enough to post as JSON. Imported only by the client widget —
// every function here touches `document`, `canvas`, or `navigator`.

export type Shot = {
  /** `data:image/png;base64,…` — what the API receives. */
  dataUrl: string;
  width: number;
  height: number;
  /** Approximate encoded size, for the "2.1 MB" hint under the preview. */
  bytes: number;
};

// Long edge, in CSS pixels, after downscaling. A retina capture of a 1512-wide
// window arrives at 3024px; nothing about a portal bug is more legible at that
// size, and the base64 of it is four megabytes of request body.
const MAX_EDGE = 1600;

// Above this, re-encode as JPEG. PNG is the better format for screenshots of
// text and stays the default, but a dense photo-heavy page can produce a PNG
// several times larger than a JPEG no one could tell apart.
const PNG_BUDGET = 1_200_000;

export function canCaptureScreen(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function";
}

/**
 * Ask the browser for a screen/tab/window and keep one frame of it.
 *
 * The picker is Chrome's own, so what gets shared is entirely the member's
 * choice — the widget cannot silently grab anything, and cannot grab anything
 * at all without this click. The stream is stopped in a `finally` the moment
 * the frame is copied, so the sharing indicator does not linger.
 */
export async function captureScreen(): Promise<Shot> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    // `displaySurface: "browser"` asks the picker to lead with browser tabs,
    // and `preferCurrentTab` (Chromium-only, hence the cast) preselects this
    // one — the member has already told us what is wrong by being on the page.
    video: { displaySurface: "browser" },
    audio: false,
    preferCurrentTab: true,
  } as DisplayMediaStreamOptions);

  try {
    const video = document.createElement("video");
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    await nextFrame(video);

    if (!video.videoWidth || !video.videoHeight) {
      throw new Error("The browser returned an empty frame.");
    }
    return draw(video, video.videoWidth, video.videoHeight);
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

/**
 * Normalise a pasted or uploaded image.
 *
 * Everything goes through a decode and a re-encode rather than being read
 * straight to base64. That costs a moment and buys two things: the same
 * downscaling the capture path gets, and a guarantee that whatever the server
 * receives really is an image the browser could decode — not a renamed PDF, and
 * not an SVG, which the API would refuse anyway but which is better never sent.
 */
export async function fromFile(file: Blob): Promise<Shot> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That file isn't an image the browser can read.");
  }
  try {
    return draw(bitmap, bitmap.width, bitmap.height);
  } finally {
    bitmap.close();
  }
}

/** Wait for a frame that actually has pixels in it. */
function nextFrame(video: HTMLVideoElement): Promise<void> {
  // rVFC fires exactly when a frame is presented; without it, two rAFs is the
  // conventional stand-in and is enough in practice for a screen-share track.
  const rvfc = (video as HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: () => void) => number;
  }).requestVideoFrameCallback;

  if (typeof rvfc === "function") {
    return new Promise((resolve) => rvfc.call(video, () => resolve()));
  }
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );
}

function draw(source: CanvasImageSource, width: number, height: number): Shot {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser wouldn't give us a canvas to draw on.");

  // Screenshots are downscaled text more often than not, and the default
  // low-quality resampling turns 12px UI type into mush at 0.5×.
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);

  const png = canvas.toDataURL("image/png");
  if (approxBytes(png) <= PNG_BUDGET) {
    return { dataUrl: png, width: w, height: h, bytes: approxBytes(png) };
  }
  const jpeg = canvas.toDataURL("image/jpeg", 0.85);
  const chosen = approxBytes(jpeg) < approxBytes(png) ? jpeg : png;
  return { dataUrl: chosen, width: w, height: h, bytes: approxBytes(chosen) };
}

/** Decoded size of a base64 data URL, without decoding it. */
function approxBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const b64 = comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Pull the first image out of a paste, if there is one. */
export function imageFromClipboard(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of Array.from(data.items)) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}
