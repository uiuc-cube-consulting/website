import { retrieve } from "@/features/04-cube-brain-rag/lib/corpus";

describe("Brain retrieval", () => {
  // Ported from the former standalone eval; exercise the production retriever.
  test.each([
    ["battery charge model prediction", "Cache Energy"],
    ["social media marketing and product launch", "TAVO"],
    ["market sizing and cost model for AR eyepieces", "Inprentus"],
    ["CAD prototype and app development", "BYLD"],
  ])("finds the expected project for %s", (question, expected) => {
    const hits = retrieve(question, 5);
    expect(hits.length).toBeLessThanOrEqual(5);
    expect(hits.some((hit) => `${hit.title} ${hit.text}`.toLowerCase().includes(expected.toLowerCase()))).toBe(true);
  });

  test.each(["how did we do it", "whom", "", "   "])(
    "returns no matches for an empty or stopword-only query: %s",
    (question) => {
      expect(retrieve(question)).toEqual([]);
    }
  );
});
