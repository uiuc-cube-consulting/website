/** Shared browser/server limits. Reject oversized values rather than truncating. */
export const INTAKE_SHORT_LIMIT = 200;
export const INTAKE_ANSWER_LIMIT = 3000;

type ApplicantInput = {
  name: string;
  email: string;
  year?: string;
  major?: string;
  college?: string;
  responses: Record<string, string>;
};

type IntakeResult =
  | { kind: "invalid"; error: string }
  | { kind: "honeypot" }
  | { kind: "valid"; applicant: ApplicantInput };

export function validateIntake(body: unknown): IntakeResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { kind: "invalid", error: "Please submit an application object." };
  }
  const input = body as Record<string, unknown>;
  if (input.company_website) return { kind: "honeypot" };

  const fields: Record<string, string> = {};
  for (const key of ["name", "email", "year", "major", "college", "why", "proud"]) {
    const value = input[key];
    if (value !== undefined && typeof value !== "string") {
      return { kind: "invalid", error: `${key} must be text.` };
    }
    const text = value ?? "";
    const limit = key === "why" || key === "proud" ? INTAKE_ANSWER_LIMIT : INTAKE_SHORT_LIMIT;
    if (text.length > limit) {
      return { kind: "invalid", error: `${key} must be ${limit} characters or fewer.` };
    }
    fields[key] = text.trim();
  }
  if (!fields.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
    return { kind: "invalid", error: "Name and a valid email are required." };
  }
  return {
    kind: "valid",
    applicant: {
      name: fields.name,
      email: fields.email,
      year: fields.year || undefined,
      major: fields.major || undefined,
      college: fields.college || undefined,
      responses: { why: fields.why, proud: fields.proud },
    },
  };
}
