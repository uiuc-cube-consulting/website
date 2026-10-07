import {
  fieldsOf,
  filterAlumni,
  formatPhone,
  getFacets,
  normalizeLinkedIn,
  parseAlumnusInput,
  type Alumnus,
} from "@/features/07-alumni-directory/lib/alumni";

function alum(overrides: Partial<Alumnus> = {}): Alumnus {
  return {
    id: overrides.full_name ?? "sample",
    full_name: "Sample Person",
    linkedin_url: null,
    headline: null,
    company: null,
    position: null,
    major: null,
    email: null,
    phone: null,
    campus_status: "unknown",
    open_to_mentor: false,
    source: "manual",
    updated_at: "2026-10-07T00:00:00Z",
    ...overrides,
  };
}

describe("fieldsOf", () => {
  test("a double major lands in both families", () => {
    expect(fieldsOf("CS + Econ")).toEqual(["Computer Science", "Business"]);
  });

  test("minors don't count", () => {
    expect(fieldsOf("Economics | Minor in Business")).toEqual(["Business"]);
    expect(fieldsOf("Accountancy & Finance | CS Minor")).toEqual(["Business"]);
    expect(fieldsOf("Information Systems | Hoeft T&M Minor")).toEqual(["Data & Information"]);
  });

  test("computer engineering is engineering, not computer science", () => {
    expect(fieldsOf("Computer Engineering")).toEqual(["Engineering"]);
  });

  test("unmatched majors are Other; no major is no family", () => {
    expect(fieldsOf("Community Health")).toEqual(["Other"]);
    expect(fieldsOf(null)).toEqual([]);
  });
});

describe("filterAlumni", () => {
  const people = [
    alum({ full_name: "Ava On", campus_status: "on_campus", major: "Computer Science", company: "Google" }),
    alum({ full_name: "Ben Off", campus_status: "off_campus", major: "Finance", company: "Scale AI", open_to_mentor: true }),
    alum({ full_name: "Cal Daisy", campus_status: "off_campus", major: "Mechanical Engineering", company: null }),
  ];

  test("filters on campus status", () => {
    expect(filterAlumni(people, { status: "on_campus" }).map((a) => a.full_name)).toEqual(["Ava On"]);
    expect(filterAlumni(people, { status: "all" })).toHaveLength(3);
  });

  test("search matches word starts only", () => {
    expect(filterAlumni(people, { query: "ai" }).map((a) => a.full_name)).toEqual(["Ben Off"]);
  });

  test("every search token must match", () => {
    expect(filterAlumni(people, { query: "ben finance" })).toHaveLength(1);
    expect(filterAlumni(people, { query: "ben google" })).toHaveLength(0);
  });

  test("combines mentors, company and field filters", () => {
    expect(filterAlumni(people, { mentorsOnly: true }).map((a) => a.full_name)).toEqual(["Ben Off"]);
    expect(filterAlumni(people, { company: "google" }).map((a) => a.full_name)).toEqual(["Ava On"]);
    expect(filterAlumni(people, { fields: ["Engineering", "Business"] }).map((a) => a.full_name)).toEqual([
      "Ben Off",
      "Cal Daisy",
    ]);
  });

  test("company sort puts alumni with no company last", () => {
    expect(filterAlumni(people, { sort: "company" }).map((a) => a.full_name)).toEqual(["Ava On", "Ben Off", "Cal Daisy"]);
  });
});

describe("getFacets", () => {
  test("counts statuses and lists only companies with 2+ alumni", () => {
    const f = getFacets([
      alum({ campus_status: "on_campus", company: "Deloitte" }),
      alum({ campus_status: "off_campus", company: "Deloitte", open_to_mentor: true }),
      alum({ company: "Solo Inc" }),
    ]);
    expect(f.status).toEqual({ on_campus: 1, off_campus: 1, unknown: 1 });
    expect(f.mentors).toBe(1);
    expect(f.companies).toEqual([{ company: "Deloitte", count: 2 }]);
  });
});

describe("normalizeLinkedIn", () => {
  test("accepts bare, www and tracking-param forms", () => {
    expect(normalizeLinkedIn("linkedin.com/in/jane-doe")).toBe("https://www.linkedin.com/in/jane-doe/");
    expect(normalizeLinkedIn("https://www.linkedin.com/in/jane-doe/?utm_source=x")).toBe(
      "https://www.linkedin.com/in/jane-doe/"
    );
  });

  test("rejects other hosts and non-profile pages", () => {
    expect(normalizeLinkedIn("https://evil.example/in/jane")).toBeNull();
    expect(normalizeLinkedIn("https://linkedin.com.evil.example/in/jane")).toBeNull();
    expect(normalizeLinkedIn("https://www.linkedin.com/feed/update/urn:li:activity:1/")).toBeNull();
    expect(normalizeLinkedIn("javascript:alert(1)")).toBeNull();
  });
});

describe("parseAlumnusInput", () => {
  const valid = { full_name: " Jane Doe ", campus_status: "on_campus", linkedin_url: "linkedin.com/in/jane" };

  test("trims, normalises and blanks empty strings to null", () => {
    const r = parseAlumnusInput({ ...valid, company: "  ", open_to_mentor: true });
    expect(r).toEqual({
      ok: true,
      value: expect.objectContaining({
        full_name: "Jane Doe",
        linkedin_url: "https://www.linkedin.com/in/jane/",
        company: null,
        open_to_mentor: true,
      }),
    });
  });

  test("rejects a missing name, a bad status, a bad email and a non-profile link", () => {
    expect(parseAlumnusInput({ ...valid, full_name: "" }).ok).toBe(false);
    expect(parseAlumnusInput({ ...valid, campus_status: "alumni" }).ok).toBe(false);
    expect(parseAlumnusInput({ ...valid, email: "nope" }).ok).toBe(false);
    expect(parseAlumnusInput({ ...valid, linkedin_url: "https://example.com" }).ok).toBe(false);
  });
});

describe("formatPhone", () => {
  test("formats 10-digit US numbers and leaves others alone", () => {
    expect(formatPhone("2175550142")).toBe("(217) 555-0142");
    expect(formatPhone("+1 217-555-0142")).toBe("(217) 555-0142");
    expect(formatPhone("+44 20 7946 0958")).toBe("+44 20 7946 0958");
  });
});
