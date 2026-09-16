import { generateAnswer } from "@/features/04-cube-brain-rag/lib/generate";
import type { Retrieved } from "@/features/04-cube-brain-rag/lib/corpus";

const chunks: Retrieved[] = [{
  id: "sample-project",
  title: "Sample project",
  client: "Example",
  term: "Spring 2026",
  keywords: ["Prototype"],
  text: "Project context. What CUBE did: Built a sample prototype.",
  source: "synthetic fixture",
  score: 1,
}];
const citations = [{ id: "sample-project", title: "Sample project" }];

describe("generateAnswer", () => {
  const originalKey = process.env.GEMINI_API_KEY;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
    // No test may reach the real API, even if a developer has credentials set.
    fetchMock = jest.spyOn(global, "fetch").mockRejectedValue(new Error("Unexpected fetch"));
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
    jest.restoreAllMocks();
  });

  test("empty chunks return empty mode without calling Gemini", async () => {
    process.env.GEMINI_API_KEY = "test-only-key";
    const result = await generateAnswer("prototype", []);
    expect(result.mode).toBe("empty");
    expect(result.answer).toContain("Try different keywords");
    expect(result.citations).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("no API key returns an extractive answer with citations", async () => {
    const result = await generateAnswer("prototype", chunks);
    expect(result.mode).toBe("extractive");
    expect(result.answer).toContain("Built a sample prototype.");
    expect(result.citations).toEqual(citations);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("a non-OK Gemini response falls back to the same extractive answer", async () => {
    const fallback = await generateAnswer("prototype", chunks);
    process.env.GEMINI_API_KEY = "test-only-key";
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));
    expect(await generateAnswer("prototype", chunks)).toEqual(fallback);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("a successful Gemini response returns its answer and source citations", async () => {
    process.env.GEMINI_API_KEY = "test-only-key";
    fetchMock.mockResolvedValue(Response.json({
      candidates: [{ content: { parts: [{ text: "Built a prototype" }, { text: " [1]." }] } }],
    }));
    expect(await generateAnswer("prototype", chunks)).toEqual({
      mode: "gemini",
      answer: "Built a prototype [1].",
      citations,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
