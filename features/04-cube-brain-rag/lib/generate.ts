// Server-only answer generation. Two tiers:
//   • ANTHROPIC_API_KEY set → Claude synthesizes an answer grounded ONLY in the
//     retrieved chunks, with citations (the "RAG" path).
//   • no key → extractive fallback: return the top matches as a readable summary,
//     so the assistant is still useful before any key is configured.
// Calls the Anthropic Messages REST API directly (no SDK dependency).

import type { Retrieved } from "./corpus";

export type Answer = {
  answer: string;
  citations: { id: string; title: string }[];
  mode: "claude" | "extractive" | "empty";
};

function context(chunks: Retrieved[]): string {
  return chunks.map((c, i) => `[${i + 1}] ${c.title}\n${c.text}`).join("\n\n");
}

function extractive(question: string, chunks: Retrieved[]): Answer {
  const lead = `Here’s what I found in CUBE’s past work related to “${question.trim()}”. (Set ANTHROPIC_API_KEY for a synthesized answer.)`;
  const body = chunks
    .map((c) => {
      const did = c.text.split("What CUBE did:")[1]?.trim() || c.text;
      const snippet = did.length > 280 ? did.slice(0, 280).trimEnd() + "…" : did;
      return `• ${c.title} — ${snippet}`;
    })
    .join("\n\n");
  return {
    answer: `${lead}\n\n${body}`,
    citations: chunks.map((c) => ({ id: c.id, title: c.title })),
    mode: "extractive",
  };
}

export async function generateAnswer(question: string, chunks: Retrieved[]): Promise<Answer> {
  if (chunks.length === 0) {
    return {
      answer:
        "I couldn’t find anything in CUBE’s past-project corpus for that. Try different keywords, or broaden the question.",
      citations: [],
      mode: "empty",
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return extractive(question, chunks);

  const model = process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest";
  const system =
    "You are CUBE Brain, an assistant for members of CUBE Consulting (a UIUC student consulting club). " +
    "Answer the question using ONLY the provided context about CUBE's past projects. " +
    "Cite the projects you draw on inline by their bracket number, e.g. [2]. " +
    "If the context doesn't contain enough to answer, say so plainly. Be concise and practical.";

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 700,
        system,
        messages: [
          {
            role: "user",
            content: `Context (CUBE past projects):\n\n${context(chunks)}\n\nQuestion: ${question}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      // Fall back gracefully rather than failing the request.
      return extractive(question, chunks);
    }
    const data = await res.json();
    const text =
      Array.isArray(data?.content) && data.content[0]?.type === "text"
        ? data.content.map((b: { text?: string }) => b.text ?? "").join("")
        : "";
    if (!text) return extractive(question, chunks);

    return {
      answer: text,
      citations: chunks.map((c) => ({ id: c.id, title: c.title })),
      mode: "claude",
    };
  } catch {
    return extractive(question, chunks);
  }
}
