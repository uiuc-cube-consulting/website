#!/usr/bin/env node
/**
 * build-corpus.mjs
 *
 * Builds the RAG corpus (data/corpus.json) that "CUBE Brain" retrieves over. v1 seeds
 * from the outreach bot's past_projects.json — one chunk per past engagement — to prove
 * the retrieval + answer loop end-to-end with zero new data. Later, extend this to pull
 * full deliverables/slides/playbooks from Drive (see SPEC.md) and re-run.
 *
 * Run from repo root:
 *   node features/04-cube-brain-rag/scripts/build-corpus.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FEATURE_DIR = resolve(__dirname, "..");
const REPO_ROOT = resolve(FEATURE_DIR, "..", "..");
const SRC = resolve(REPO_ROOT, "project-acquisition", "data", "past_projects.json");
const OUT = resolve(FEATURE_DIR, "data", "corpus.json");

const SEASON = { FA: "Fall", SP: "Spring" };

function termLabel(sem) {
  const m = /^([A-Z]{2})(\d{2})$/.exec(String(sem || "").trim());
  return m ? `${SEASON[m[1]] ?? m[1]} 20${m[2]}` : String(sem || "");
}

function clean(name) {
  return String(name || "").replace(/\s*\(\d+\)/g, "").replace(/\s+/g, " ").trim();
}

function main() {
  const projects = JSON.parse(readFileSync(SRC, "utf8"));
  const chunks = [];

  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    const client = clean(p.client) || "Confidential client";
    const term = termLabel(p.semester);
    const keywords = Array.isArray(p.keywords) ? p.keywords.join(", ") : "";
    const deliverables = String(p.deliverables || "").trim();
    if (!deliverables && !keywords) continue; // nothing retrievable

    // The text the retriever scores against + the model reads.
    const text = [
      `Client: ${client}`,
      term && `Semester: ${term}`,
      keywords && `Focus areas: ${keywords}`,
      deliverables && `What CUBE did: ${deliverables}`,
    ]
      .filter(Boolean)
      .join("\n");

    chunks.push({
      id: `${client.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${(p.semester || i).toString().toLowerCase()}`,
      title: term ? `${client} — ${term}` : client,
      client,
      term,
      keywords: Array.isArray(p.keywords) ? p.keywords : [],
      text,
      source: "past_projects.json",
    });
  }

  writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), count: chunks.length, chunks }, null, 2) + "\n");
  console.log(`Wrote ${chunks.length} corpus chunks -> ${OUT}`);
}

main();
