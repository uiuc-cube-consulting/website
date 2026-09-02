// Pure Google Docs body generation for the blank interview-notes page. No I/O and
// no `googleapis` import — the Docs API request objects are plain JSON, so this
// is fully unit-testable and safe to import anywhere.
//
// This module used to GENERATE the two rubric docs from the criteria in
// ./interview.ts. It no longer does, and that is deliberate. The rubric is a
// document the club writes and revises; the portal's job is to copy THAT into
// each candidate folder (see RUBRIC_TEMPLATES in ./provision-store.ts), not to
// re-typeset its own version. A generated sheet was a second document claiming to
// be the rubric, and it could only ever be the wrong one.
//
// What remains is the notes page, which has no master to copy because it is
// meant to be empty.


/** A Docs API `batchUpdate` request. Structural typing keeps googleapis out of here. */
export type DocsRequest = Record<string, unknown>;

export type RubricDocMeta = {
  candidateName: string;
  candidateEmail: string;
  /** e.g. "Junior · Statistics · LAS" — rendered verbatim under the title. */
  subtitle?: string;
  /** e.g. "Notes", used in the heading. */
  label: string;
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
