#!/usr/bin/env node
/**
 * eval.mjs — retrieval sanity check for CUBE Brain.
 *
 * Mirrors the TF-IDF retrieval in lib/corpus.ts and asserts that, for a set of
 * real questions, an expected client/topic shows up in the top-k results. This is
 * the non-negotiable "does retrieval actually work" gate before trusting answers.
 * Extend EVALS as the corpus grows.
 *
 *   node features/04-cube-brain-rag/scripts/eval.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const corpus = JSON.parse(readFileSync(resolve(__dirname, "..", "data", "corpus.json"), "utf8"));
const CHUNKS = corpus.chunks;

const STOP = new Set("the a an and or of to for in on with how did do does we our us you your i it is are was were be been being this that these those what which who when where why can could should would about into from at by as".split(" "));
const tok = (s) => (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length > 2 && !STOP.has(t));

const DF = new Map();
for (const c of CHUNKS) for (const t of new Set(tok(`${c.text} ${c.keywords.join(" ")}`))) DF.set(t, (DF.get(t) ?? 0) + 1);
const N = CHUNKS.length;
const idf = (t) => (DF.get(t) ? Math.log((N + 1) / (DF.get(t) + 0.5)) : 0);

function retrieve(q, k = 5) {
  const qs = tok(q);
  return CHUNKS.map((c) => {
    const tf = new Map();
    for (const t of tok(c.text)) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of tok(c.keywords.join(" "))) tf.set(t, (tf.get(t) ?? 0) + 2);
    let s = 0;
    for (const t of qs) s += (tf.get(t) ?? 0) * idf(t);
    return { ...c, score: s };
  }).filter((c) => c.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
}

// question → a substring we expect to see among the top-k titles/text.
const EVALS = [
  { q: "battery charge model prediction", expect: "Cache Energy" },
  { q: "social media marketing and product launch", expect: "TAVO" },
  { q: "market sizing and cost model for AR eyepieces", expect: "Inprentus" },
  { q: "CAD prototype and app development", expect: "BYLD" },
];

let pass = 0;
for (const { q, expect } of EVALS) {
  const hits = retrieve(q, 5);
  const found = hits.some((h) => `${h.title} ${h.text}`.toLowerCase().includes(expect.toLowerCase()));
  console.log(`${found ? "PASS" : "FAIL"}  "${q}"  → expect ${expect}  | top: ${hits.slice(0, 3).map((h) => h.client).join(", ")}`);
  if (found) pass++;
}
console.log(`\n${pass}/${EVALS.length} retrieval checks passed`);
process.exit(pass === EVALS.length ? 0 : 1);
