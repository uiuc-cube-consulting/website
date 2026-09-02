// Pure Google Docs body generation for the per-candidate rubric docs. No I/O and
// no `googleapis` import — the Docs API request objects are plain JSON, so this
// is fully unit-testable and safe to import anywhere.
//
// Why generate rather than copy a template doc:
//   - CASE_RUBRIC and BEHAVIORAL_RUBRIC in ./interview.ts are already the single
//     source of truth for what the portal scores against. A template doc in
//     Drive would be a second copy of the criteria and anchors, and the two
//     would drift the first time someone tweaks an anchor in code.
//   - Copying a template requires read access to that template, which would drag
//     in a Drive scope we would otherwise not need for created files.
//
// The doc is a paper fallback for the portal console, so it deliberately mirrors
// the portal's rubric exactly: same criteria, same order, same level descriptions,
// same per-criterion ceilings and total, same four recommendation values. Both
// come from ./interview.ts, which is itself a transcription of the club's printed
// FA26 sheets — so all three say the same thing by construction.

import { RECOMMENDATIONS } from "./interview";
import type { BehavioralQuestion } from "./interview";
import type { RubricCriterion } from "./types";
import { rubricMaxPoints } from "./types";

/** A Docs API `batchUpdate` request. Structural typing keeps googleapis out of here. */
export type DocsRequest = Record<string, unknown>;

export type RubricDocMeta = {
  candidateName: string;
  candidateEmail: string;
  /** e.g. "Junior · Statistics · LAS" — rendered verbatim under the title. */
  subtitle?: string;
  /** e.g. "Case" / "Behavioral", used in the heading. */
  label: string;
  /**
   * The interview script, printed above the rubric. Only the behavioral sheet has
   * one; the case sheet is scored against whatever case the panel runs.
   */
  questions?: readonly BehavioralQuestion[];
};

// ── Text assembly ────────────────────────────────────────────────────────────
// We build the entire body as one string, remembering the ranges we want styled,
// then emit a single insertText followed by styling requests. Styling never
// changes text length, so every range stays valid — which is what makes this
// safe to reason about without simulating the document.

type Span = { start: number; end: number };

class Body {
  /** Docs bodies start at index 1; index 0 is the document start marker. */
  private text = "";
  readonly headings: Span[] = [];
  readonly subheadings: Span[] = [];
  readonly bold: Span[] = [];
  readonly muted: Span[] = [];

  private push(s: string): Span {
    const start = this.text.length + 1;
    this.text += s;
    return { start, end: this.text.length + 1 };
  }

  line(s = ""): Span {
    return this.push(`${s}\n`);
  }

  heading(s: string): void {
    this.headings.push(this.line(s));
  }

  subheading(s: string): void {
    this.subheadings.push(this.line(s));
  }

  /** A `Label: value` line where only the label is bold. */
  labelled(label: string, value = ""): void {
    const span = this.line(`${label}${value}`);
    this.bold.push({ start: span.start, end: span.start + label.length });
  }

  mutedLine(s: string): void {
    this.muted.push(this.line(s));
  }

  toString(): string {
    return this.text;
  }
}

/** A blank line for a human to write on. Underscores survive copy-paste and print. */
const WRITE_IN = "_".repeat(40);

/**
 * The full text body plus styling spans for one candidate's rubric doc.
 * Exported separately from `rubricDocRequests` so tests can assert on the
 * rendered text without wading through Docs API JSON.
 */
export function renderRubricBody(
  rubric: readonly RubricCriterion[],
  meta: RubricDocMeta
): { text: string; requests: DocsRequest[] } {
  const b = new Body();
  const maxPoints = rubricMaxPoints(rubric);

  b.heading(`${meta.label} Rubric — ${meta.candidateName}`);
  b.mutedLine(
    [meta.candidateEmail, meta.subtitle].filter(Boolean).join("  ·  ")
  );
  b.line();
  b.labelled("Interviewers: ", WRITE_IN);
  b.labelled("Date: ", WRITE_IN);
  b.line();
  b.mutedLine(
    `Score every category out of its own maximum — they are not all worth the same — ` +
      `for a total out of ${maxPoints}. Zero is a real score ("Unacceptable Answer"), not a ` +
      "blank, so leave nothing unmarked. Scores written here still need to be recorded in " +
      "the portal."
  );
  b.line();

  // The behavioral sheet is half script, half rubric: the questions come first,
  // in the order they are asked, each tagged with the category it feeds.
  if (meta.questions?.length) {
    b.subheading("Interview questions");
    let resumeHeaderShown = false;
    for (const q of meta.questions) {
      if (q.resumeReview && !resumeHeaderShown) {
        b.mutedLine("Resume review — prepare these before the interview starts.");
        resumeHeaderShown = true;
      }
      b.labelled(`${q.n}. `, q.text);
      if (q.category) {
        const cat = rubric.find((c) => c.key === q.category);
        if (cat) b.mutedLine(`Scores: ${cat.label}`);
      }
      if (q.resumeReview) b.labelled("Question: ", WRITE_IN);
      b.labelled("Notes: ", "");
      b.line();
    }
    b.line();
    b.subheading("Rubric");
    b.line();
  }

  for (const c of rubric) {
    b.subheading(`${c.label}  (out of ${c.max})`);
    for (const q of c.prompts ?? []) b.mutedLine(q);
    b.line(c.anchor);
    for (const l of c.levels) {
      const band = l.min === l.max ? String(l.min) : `${l.min}–${l.max}`;
      b.labelled(`${band} · ${l.label}: `, l.descriptor);
    }
    b.labelled(`Score (0–${c.max}): `, WRITE_IN);
    b.labelled("Notes: ", "");
    b.line();
    b.line();
  }

  b.subheading("Bottom line");
  b.labelled("Total: ", `${WRITE_IN} / ${maxPoints}`);
  b.labelled(
    "Recommendation: ",
    RECOMMENDATIONS.map((r) => r.label).join("   /   ")
  );
  b.line();
  b.labelled("Additional comments — major red or green flags: ", "");
  b.line();
  b.line();

  const text = b.toString();

  // One insert, then styling. Order matters: the text must exist before any
  // range refers to it.
  const requests: DocsRequest[] = [
    { insertText: { location: { index: 1 }, text } },
  ];

  for (const span of b.headings) {
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: span.start, endIndex: span.end },
        paragraphStyle: { namedStyleType: "HEADING_1" },
        fields: "namedStyleType",
      },
    });
  }
  for (const span of b.subheadings) {
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: span.start, endIndex: span.end },
        paragraphStyle: { namedStyleType: "HEADING_2" },
        fields: "namedStyleType",
      },
    });
  }
  for (const span of b.bold) {
    requests.push({
      updateTextStyle: {
        range: { startIndex: span.start, endIndex: span.end },
        textStyle: { bold: true },
        fields: "bold",
      },
    });
  }
  for (const span of b.muted) {
    requests.push({
      updateTextStyle: {
        range: { startIndex: span.start, endIndex: span.end },
        textStyle: {
          italic: true,
          foregroundColor: { color: { rgbColor: { red: 0.4, green: 0.4, blue: 0.4 } } },
        },
        fields: "italic,foregroundColor",
      },
    });
  }

  return { text, requests };
}

/** Docs API `batchUpdate` requests for one candidate's rubric doc. */
export function rubricDocRequests(
  rubric: readonly RubricCriterion[],
  meta: RubricDocMeta
): DocsRequest[] {
  return renderRubricBody(rubric, meta).requests;
}

// ── Interview notes doc ──────────────────────────────────────────────────────

/**
 * A near-empty doc for the panel to type into live. Intentionally minimal — its
 * value is being a blank shared page that already exists and is already named,
 * so nobody spends the first minute of an interview creating one.
 */
export function notesDocRequests(meta: RubricDocMeta): DocsRequest[] {
  const b = new Body();
  b.heading(`Interview Notes — ${meta.candidateName}`);
  b.mutedLine([meta.candidateEmail, meta.subtitle].filter(Boolean).join("  ·  "));
  b.line();
  b.labelled("Interviewers: ", WRITE_IN);
  b.labelled("Date: ", WRITE_IN);
  b.line();

  const text = b.toString();
  const requests: DocsRequest[] = [
    { insertText: { location: { index: 1 }, text } },
  ];
  for (const span of b.headings) {
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: span.start, endIndex: span.end },
        paragraphStyle: { namedStyleType: "HEADING_1" },
        fields: "namedStyleType",
      },
    });
  }
  for (const span of b.bold) {
    requests.push({
      updateTextStyle: {
        range: { startIndex: span.start, endIndex: span.end },
        textStyle: { bold: true },
        fields: "bold",
      },
    });
  }
  for (const span of b.muted) {
    requests.push({
      updateTextStyle: {
        range: { startIndex: span.start, endIndex: span.end },
        textStyle: {
          italic: true,
          foregroundColor: { color: { rgbColor: { red: 0.4, green: 0.4, blue: 0.4 } } },
        },
        fields: "italic,foregroundColor",
      },
    });
  }
  return requests;
}
