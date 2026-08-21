#!/usr/bin/env node
// One-time helper: mint the refresh token that lets the portal create Drive
// folders as the recruiting officer.
//
//   node scripts/drive-consent.mjs
//
// Why this exists at all: a Google service account has no Drive storage quota
// and cannot own files, so it physically cannot create the candidate folders or
// copy a resume. On a personal Gmail account (no Shared Drives) the only way to
// write is to act as a real user. This script runs the OAuth loopback flow once
// and prints a refresh token to paste into .env; after that the portal button
// works unattended and nobody signs in again.
//
// ── Google Cloud setup, once ────────────────────────────────────────────────
// In the EXISTING cube-project-496921 project — deliberately not the project
// behind AUTH_GOOGLE_ID, because restricted scopes attach to a project's consent
// screen and would show an "unverified app" warning to every member signing into
// the portal:
//
//   1. Enable the Google Drive API and the Google Docs API.
//   2. OAuth consent screen → External → add the recruiting officer as the sole
//      user, then set publishing status to **In production**.
//      This step is not optional: an app left in "Testing" expires its refresh
//      tokens after 7 days, which would break the button every week.
//      Unverified + restricted scopes still works — you will see a
//      "Google hasn't verified this app" screen once and click
//      Advanced → Go to CUBE (unsafe). The 100-user cap is irrelevant here
//      because exactly one account ever authorizes.
//   3. Credentials → Create OAuth client ID → **Desktop app**.
//      Put the client id/secret in .env as RECRUITING_DRIVE_CLIENT_ID and
//      RECRUITING_DRIVE_CLIENT_SECRET, then run this script.

import http from "node:http";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { google } from "googleapis";
import { readFileSync } from "node:fs";

// Same scopes as features/03-recruitment-ats/lib/drive-write.ts. `drive.file`
// would be friendlier but only ever grants access to files this app created —
// the resume was created by the Google Form, so copying it needs the full scope.
const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/documents",
];

const PORT = 53682;
const REDIRECT = `http://127.0.0.1:${PORT}`;

/** Read .env without adding a dotenv dependency for a script run twice a year. */
function envFromFile() {
  try {
    const out = {};
    for (const line of readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n")) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    return out;
  } catch {
    return {};
  }
}

const fileEnv = envFromFile();
const clientId = process.env.RECRUITING_DRIVE_CLIENT_ID || fileEnv.RECRUITING_DRIVE_CLIENT_ID;
const clientSecret =
  process.env.RECRUITING_DRIVE_CLIENT_SECRET || fileEnv.RECRUITING_DRIVE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error(
    "\nMissing credentials.\n" +
      "Set RECRUITING_DRIVE_CLIENT_ID and RECRUITING_DRIVE_CLIENT_SECRET in .env first\n" +
      "(Google Cloud → cube-project-496921 → Credentials → OAuth client ID → Desktop app).\n"
  );
  process.exit(1);
}

const oauth = new google.auth.OAuth2({ clientId, clientSecret, redirectUri: REDIRECT });

const url = oauth.generateAuthUrl({
  access_type: "offline", // required to get a refresh token at all
  prompt: "consent", // force a fresh refresh token even if already consented
  scope: SCOPES,
});

console.log(
  "\n1. Sign in as the account that OWNS the recruiting Form, the response sheet,\n" +
    "   and the 'CUBE Recruiting' Drive folder. Every folder this creates will be\n" +
    "   owned by that account.\n" +
    "\n2. Open this URL:\n\n" +
    url +
    "\n\n3. On the 'Google hasn't verified this app' screen, click\n" +
    "   Advanced → Go to ... (unsafe). That warning is expected for an\n" +
    "   unverified internal tool and is safe here — it is your own app.\n\n" +
    `Waiting for the redirect on ${REDIRECT} ...\n`
);

/** Serve the loopback redirect once, exchange the code, print the token. */
const code = await new Promise((resolve, reject) => {
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url, REDIRECT);
    const returnedCode = requestUrl.searchParams.get("code");
    const error = requestUrl.searchParams.get("error");

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      returnedCode
        ? "<h2>Authorized.</h2><p>You can close this tab and return to the terminal.</p>"
        : `<h2>Authorization failed</h2><p>${error ?? "No code returned."}</p>`
    );
    server.close();
    if (returnedCode) resolve(returnedCode);
    else reject(new Error(error ?? "No code returned"));
  });
  server.on("error", reject);
  server.listen(PORT);

  // Fallback for a machine where the browser cannot reach the loopback server.
  const rl = createInterface({ input: stdin, output: stdout });
  rl.question("...or paste the ?code= value from the redirect URL here: ")
    .then((answer) => {
      const trimmed = answer.trim();
      if (trimmed) {
        server.close();
        resolve(trimmed);
      }
      rl.close();
    })
    .catch(() => {});
});

const { tokens } = await oauth.getToken(code);

if (!tokens.refresh_token) {
  console.error(
    "\nGoogle returned no refresh token. This happens when the account has already\n" +
      "granted these scopes. Revoke access at\n" +
      "  https://myaccount.google.com/permissions\n" +
      "and run this script again.\n"
  );
  process.exit(1);
}

console.log(
  "\n─────────────────────────────────────────────────────────────────────\n" +
    "Add this to .env (and to the deploy environment):\n\n" +
    `RECRUITING_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}\n\n` +
    "Treat it like a password — it grants full Drive access to that account.\n" +
    ".env is already gitignored.\n" +
    "─────────────────────────────────────────────────────────────────────\n"
);
