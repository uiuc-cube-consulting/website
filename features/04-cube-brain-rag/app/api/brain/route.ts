import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { corpusSize, retrieve } from "@/features/04-cube-brain-rag/lib/corpus";
import { generateAnswer } from "@/features/04-cube-brain-rag/lib/generate";
import { BRAIN_QUESTION_LIMIT } from "@/features/04-cube-brain-rag/lib/limits";

// Members-only RAG endpoint: retrieve relevant past-project chunks, then answer
// (Gemini when keyed, extractive otherwise). The corpus is internal data, and the
// route is auth-gated, so client-confidential material never leaves the member boundary.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body) ||
      !("question" in body) || typeof body.question !== "string") {
    return NextResponse.json({ error: "A question is required." }, { status: 400 });
  }
  if (body.question.length > BRAIN_QUESTION_LIMIT) {
    return NextResponse.json(
      { error: `Please keep your question to ${BRAIN_QUESTION_LIMIT} characters or fewer.` },
      { status: 400 },
    );
  }
  const question = body.question.trim();
  if (!question) return NextResponse.json({ error: "A question is required." }, { status: 400 });

  try {
    const chunks = retrieve(question, 5);
    const answer = await generateAnswer(question, chunks);
    return NextResponse.json({ ...answer, corpusSize: corpusSize() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to answer" },
      { status: 500 }
    );
  }
}
