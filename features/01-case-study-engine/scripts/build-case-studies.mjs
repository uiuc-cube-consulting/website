#!/usr/bin/env node
/**
 * build-case-studies.mjs
 *
 * Transforms the raw outreach-bot dataset (project-acquisition/data/past_projects.json,
 * 102 projects with messy free-text keywords) into a clean, public-ready case-study
 * dataset for the website library.
 *
 * What it does:
 *   1. Reads past_projects.json (fields: semester, client, keywords[], deliverables).
 *   2. Normalizes the 188 inconsistent keywords into a small set of clean PRACTICE AREAS
 *      (e.g. "Comp. Analysis" + "Competitor Analysis" -> "Strategy & Research").
 *   3. Derives season (Fall/Spring), year, a sortable term index, and a stable id.
 *   4. Applies data/anonymization.json so individual clients can be hidden behind an
 *      alias on the public site. Anonymized rows do NOT carry the real client name.
 *   5. Writes data/case_studies.json (a plain array, newest-first).
 *
 * Run from the repo root:
 *   node features/01-case-study-engine/scripts/build-case-studies.mjs
 *
 * It re-reads the source each time, so re-run it whenever past_projects.json changes
 * (e.g. after a new semester is parsed into the outreach bot).
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FEATURE_DIR = resolve(__dirname, "..");
const REPO_ROOT = resolve(FEATURE_DIR, "..", "..");

const SRC = resolve(REPO_ROOT, "project-acquisition", "data", "past_projects.json");
const ANON_CFG = resolve(FEATURE_DIR, "data", "anonymization.json");
const OUT = resolve(FEATURE_DIR, "data", "case_studies.json");

/**
 * Practice-area taxonomy. Ordered: the first bucket a project matches is its "primary"
 * area (used for the anonymization alias). A project can belong to several areas.
 * `terms` are matched case-insensitively against each keyword and, as a fallback, the
 * deliverables text. Short tokens (<= 3 chars, e.g. "ai", "ml", "ux") match on word
 * boundaries so they don't fire inside "email" or "html".
 */
const TAXONOMY = [
  {
    area: "Strategy & Research",
    terms: [
      "market research", "market strategy", "market entry", "market size", "market sizing",
      "market analysis", "go-to-market", "gtm", "competitor", "competitive", "comp. analysis",
      "comp analysis", "business strategy", "expansion", "customer development",
      "customer discovery", "customer identification", "feasibility", "data collection",
      "due diligence", "benchmark", "segmentation", "swot", "research", "strategy",
    ],
  },
  {
    area: "Marketing & Brand",
    terms: [
      "marketing", "social media", "branding", "brand", "content", "advertis", "seo",
      "product launch", "campaign", "public relations", "outreach", "go to market",
    ],
  },
  {
    area: "AI & Machine Learning",
    terms: [
      "machine learning", "artificial intelligence", "deep learning", "neural",
      "computer vision", "predictive", "llm", "nlp", "ai", "ml",
    ],
  },
  {
    area: "Software & Data",
    terms: [
      "software", "coding", "front end", "frontend", "back end", "backend", "app dev",
      "app development", "web app", "website", "full stack", "full-stack", "database",
      "data analysis", "data analytics", "data visualization", "data viz", "dashboard",
      "automation", "api", "integration", "platform", "mobile app", "sql", "it",
    ],
  },
  {
    area: "Product & Hardware",
    terms: [
      "cad", "3d model", "3d modelling", "3d modeling", "prototype", "hardware",
      "electronics", "arduino", "product design", "product development", "product improvement",
      "industrial design", "manufacturing", "sensor", "iot", "robot", "mechanical", "pcb",
      "ui/ux", "design", "ux", "ui",
    ],
  },
  {
    area: "Finance & Operations",
    terms: [
      "financial", "finance", "cost model", "unit economics", "pricing", "revenue",
      "valuation", "fundraising", "investor", "accounting", "budget", "operations",
      "supply chain", "inventory", "logistics", "process improvement",
    ],
  },
];

const SHORT_TOKENS = new Set(["ai", "ml", "ui", "ux", "it", "pr", "seo", "gtm", "cad", "iot", "sql", "pcb", "nlp", "llm"]);

function normalize(text) {
  return ` ${String(text || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()} `;
}

function termMatches(haystackPadded, term) {
  if (SHORT_TOKENS.has(term)) {
    return haystackPadded.includes(` ${term} `);
  }
  return haystackPadded.includes(term);
}

function areasFor(keywords, deliverables) {
  const hits = new Set();
  const kwPadded = normalize(keywords.join(" "));
  for (const { area, terms } of TAXONOMY) {
    if (terms.some((t) => termMatches(kwPadded, t))) hits.add(area);
  }
  // Fallback: infer from the deliverables prose if keywords yielded nothing.
  if (hits.size === 0) {
    const dPadded = normalize(deliverables);
    for (const { area, terms } of TAXONOMY) {
      if (terms.some((t) => termMatches(dPadded, t))) hits.add(area);
    }
  }
  // Keep taxonomy order so the "primary" area is stable.
  const ordered = TAXONOMY.map((t) => t.area).filter((a) => hits.has(a));
  return ordered.length ? ordered : ["General Consulting"];
}

function parseTerm(semester) {
  const m = /^([A-Z]{2})(\d{2})$/.exec(String(semester || "").trim());
  if (!m) return { season: "", year: 0, termLabel: String(semester || ""), termIndex: 0 };
  const season = m[1] === "FA" ? "Fall" : m[1] === "SP" ? "Spring" : m[1];
  const year = 2000 + Number(m[2]);
  // Fall sorts after Spring within a year.
  const termIndex = year * 10 + (season === "Fall" ? 2 : 1);
  return { season, year, termLabel: `${season} ${year}`, termIndex };
}

/**
 * Source client names carry repeat-engagement counters like "EarthSense (4)" or
 * "Banato (3)" — these mean the Nth time CUBE worked with that client, not footnotes.
 * Strip the counter for a clean display name; we surface the repeat relationship
 * separately as a "repeat client" signal.
 */
function cleanClientName(raw) {
  return String(raw || "")
    .replace(/\s*\(\d+\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function main() {
  const projects = JSON.parse(readFileSync(SRC, "utf8"));
  const anon = JSON.parse(readFileSync(ANON_CFG, "utf8"));
  const hideSet = new Set((anon.anonymizeClients || []).map((s) => String(s).trim().toLowerCase()));
  const aliasTemplate = anon.aliasTemplate || "Confidential {practice} Client";

  const seenIds = new Map();
  const studies = projects.map((p, i) => {
    const client = cleanClientName(p.client);
    const keywords = Array.isArray(p.keywords) ? p.keywords.map((k) => String(k).trim()).filter(Boolean) : [];
    const deliverables = String(p.deliverables || "").trim();
    const term = parseTerm(p.semester);
    const practiceAreas = areasFor(keywords, deliverables);
    const primary = practiceAreas[0];

    const isAnon = hideSet.has(client.toLowerCase()) || !client;
    const displayName = isAnon ? aliasTemplate.replace("{practice}", primary) : client;

    // Stable, unique id. Anonymized rows get a neutral id (no real name leaked).
    let baseId = isAnon
      ? `confidential-${slugify(primary)}-${p.semester || i}`
      : `${slugify(client)}-${(p.semester || "").toLowerCase()}`;
    if (!baseId || baseId === "-") baseId = `project-${i}`;
    const count = (seenIds.get(baseId) || 0) + 1;
    seenIds.set(baseId, count);
    const id = count > 1 ? `${baseId}-${count}` : baseId;

    return {
      id,
      name: displayName,
      anonymized: isAnon,
      practiceAreas,
      keywords, // raw, kept for search recall (e.g. "CAD"); not rendered as chips
      summary: deliverables || "Engagement details available on request.",
      hasDetails: deliverables.length > 0,
      semester: p.semester || "",
      season: term.season,
      year: term.year,
      termLabel: term.termLabel,
      termIndex: term.termIndex,
      engagements: 1,
      repeatClient: false,
    };
  });

  // Repeat-client signal: how many semesters CUBE worked with this client.
  const counts = {};
  for (const s of studies) if (!s.anonymized && s.name) counts[s.name] = (counts[s.name] || 0) + 1;
  for (const s of studies) {
    s.engagements = s.anonymized ? 1 : counts[s.name] || 1;
    s.repeatClient = s.engagements > 1;
  }

  // Newest first; ties broken alphabetically by display name.
  studies.sort((a, b) => b.termIndex - a.termIndex || a.name.localeCompare(b.name));

  writeFileSync(OUT, JSON.stringify(studies, null, 2) + "\n", "utf8");

  // ---- build report ----
  const byArea = {};
  for (const s of studies) for (const a of s.practiceAreas) byArea[a] = (byArea[a] || 0) + 1;
  const anonCount = studies.filter((s) => s.anonymized).length;
  const noDetails = studies.filter((s) => !s.hasDetails).length;
  console.log(`Wrote ${studies.length} case studies -> ${OUT}`);
  console.log(`  anonymized: ${anonCount}   missing-details: ${noDetails}`);
  console.log("  practice areas:");
  for (const [a, c] of Object.entries(byArea).sort((x, y) => y[1] - x[1])) {
    console.log(`    ${String(c).padStart(3)}  ${a}`);
  }
  const terms = [...new Set(studies.map((s) => s.termLabel))];
  console.log(`  terms (${terms.length}): ${terms.join(", ")}`);
}

main();
