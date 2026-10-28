import { NextRequest } from "next/server";
import { BRAIN_QUESTION_LIMIT } from "@/features/04-cube-brain-rag/lib/limits";

jest.mock("@/auth", () => ({ auth: jest.fn() }));
jest.mock("@/features/04-cube-brain-rag/lib/corpus", () => ({
  retrieve: jest.fn(() => []), corpusSize: jest.fn(() => 1),
}));
jest.mock("@/features/04-cube-brain-rag/lib/generate", () => ({
  generateAnswer: jest.fn(async () => ({ answer: "Test answer", citations: [] })),
}));
import { auth } from "@/auth";
import { retrieve } from "@/features/04-cube-brain-rag/lib/corpus";
import { generateAnswer } from "@/features/04-cube-brain-rag/lib/generate";
import { POST } from "@/features/04-cube-brain-rag/app/api/brain/route";

const post = (body: unknown) => new NextRequest("https://example.com/api/brain", {
  method: "POST", body: JSON.stringify(body),
});
beforeEach(() => {
  jest.clearAllMocks();
  (auth as jest.Mock).mockResolvedValue({ user: { email: "member@example.com" } });
});

test.each([null, [], {}, { question: 5 }, { question: {} }, { question: "" }, { question: "  " },
  { question: "x".repeat(BRAIN_QUESTION_LIMIT + 1) },
  { question: " ".repeat(BRAIN_QUESTION_LIMIT + 1) },
])("invalid question never retrieves or generates: %p", async (body) => {
  expect((await POST(post(body))).status).toBe(400);
  expect(retrieve).not.toHaveBeenCalled();
  expect(generateAnswer).not.toHaveBeenCalled();
});

test("invalid JSON returns 400", async () => {
  const response = await POST(new NextRequest("https://example.com/api/brain", {
    method: "POST", body: "{",
  }));
  expect(response.status).toBe(400);
  expect(generateAnswer).not.toHaveBeenCalled();
});

test("signed-out requests are rejected before validation", async () => {
  (auth as jest.Mock).mockResolvedValue(null);
  expect((await POST(post({ question: "Test?" }))).status).toBe(401);
  expect(generateAnswer).not.toHaveBeenCalled();
});

test("the exact limit is accepted", async () => {
  const question = "x".repeat(BRAIN_QUESTION_LIMIT);
  expect((await POST(post({ question }))).status).toBe(200);
  expect(retrieve).toHaveBeenCalledWith(question, 5);
  expect(generateAnswer).toHaveBeenCalledWith(question, []);
});
