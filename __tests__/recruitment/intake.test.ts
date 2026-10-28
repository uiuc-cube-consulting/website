import { NextRequest } from "next/server";
import { validateIntake, INTAKE_ANSWER_LIMIT, INTAKE_SHORT_LIMIT } from "@/features/03-recruitment-ats/lib/intake";

jest.mock("@/features/03-recruitment-ats/lib/store", () => ({
  createApplicant: jest.fn(async () => ({ ok: true, id: "app-test" })),
}));
jest.mock("@/features/03-recruitment-ats/lib/visibility", () => ({
  getActiveCycle: jest.fn(async () => "fall-test"),
}));
import { createApplicant } from "@/features/03-recruitment-ats/lib/store";
import { getActiveCycle } from "@/features/03-recruitment-ats/lib/visibility";
import { POST } from "@/features/03-recruitment-ats/app/api/recruitment/apply/route";

const valid = { name: "Test Applicant", email: "applicant@example.com", why: "Learn consulting.", proud: "A class project." };
const request = (body: unknown) => new NextRequest("https://example.com/api/recruitment/apply", {
  method: "POST", body: JSON.stringify(body),
});
beforeEach(() => jest.clearAllMocks());

test("only allowlisted fields reach storage; the cycle is server-owned", async () => {
  const response = await POST(request({ ...valid, cycle: "attacker", arbitrary: "junk", role: "exec" }));
  expect(response.status).toBe(200);
  expect(createApplicant).toHaveBeenCalledWith({
    name: valid.name, email: valid.email,
    cycle: "fall-test", year: undefined, major: undefined, college: undefined,
    responses: { why: valid.why, proud: valid.proud },
  });
});

test.each([null, [], "text", 42, { ...valid, name: {} }, { ...valid, email: "bad" }])(
  "rejects malformed input without writing: %p", async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(createApplicant).not.toHaveBeenCalled();
  },
);

test.each(["name", "email", "year", "major", "college", "why", "proud"])(
  "rejects an oversized %s", async (key) => {
    const limit = key === "why" || key === "proud" ? INTAKE_ANSWER_LIMIT : INTAKE_SHORT_LIMIT;
    const response = await POST(request({ ...valid, [key]: "x".repeat(limit + 1) }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain(String(limit));
    expect(createApplicant).not.toHaveBeenCalled();
  },
);

test("accepts answers at the exact limit", () => {
  expect(validateIntake({ ...valid, why: "x".repeat(INTAKE_ANSWER_LIMIT) }).kind).toBe("valid");
});

test("honeypot succeeds without consulting storage or the active cycle", async () => {
  const response = await POST(request({ ...valid, company_website: "https://example.com" }));
  expect(await response.json()).toEqual({ ok: true });
  expect(createApplicant).not.toHaveBeenCalled();
  expect(getActiveCycle).not.toHaveBeenCalled();
});
