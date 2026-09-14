/**
 * /api/points with categories. Every award lands in fundamentals, professional
 * or social, and the board reports each member's breakdown.
 *
 * The category column comes from db/point-categories.sql, which is run by hand,
 * so two failure modes are pinned here: the board must still load if the code
 * deploys first, and an award must be refused, not quietly stored without its
 * category.
 */

import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────────────────

let mockSession: { user: { email: string; role: string; memberId: string } } | null = null;
jest.mock("@/auth", () => ({ auth: jest.fn(() => Promise.resolve(mockSession)) }));

type DbError = { code?: string; message: string };
type DbResult = { data: unknown; error: DbError | null };
type Row = Record<string, unknown>;

const db = {
  members: [] as Row[],
  entries: [] as Row[],
  inserts: [] as Row[],
  /** False simulates db/point-categories.sql not having been run. */
  categoryColumn: true,
};

// Just enough of the supabase-js query builder for this route: select / insert
// / eq / order, awaited directly or through single().
function fakeQuery(table: string) {
  let columns = "*";
  let insertRow: Row | null = null;
  const filters: [string, unknown][] = [];

  const resolve = (single: boolean): DbResult => {
    const namesCategory = columns.includes("category") || Boolean(insertRow && "category" in insertRow);
    if (table === "point_entries" && !db.categoryColumn && namesCategory) {
      return insertRow
        ? { data: null, error: { code: "PGRST204", message: "Could not find the 'category' column of 'point_entries'" } }
        : { data: null, error: { code: "42703", message: "column point_entries.category does not exist" } };
    }
    if (insertRow) {
      const saved = { id: `pe-${db.inserts.length + 1}`, created_at: "2026-09-13T00:00:00.000Z", ...insertRow };
      db.inserts.push(saved);
      db.entries.push(saved);
      return { data: saved, error: null };
    }
    const source = table === "members" ? db.members : db.entries;
    const rows = source.filter((r) => filters.every(([k, v]) => r[k] === v));
    return { data: single ? rows[0] ?? null : rows, error: null };
  };

  const chain = {
    select(cols?: string) {
      if (cols) columns = cols;
      return chain;
    },
    insert(row: Row) {
      insertRow = row;
      return chain;
    },
    eq(col: string, val: unknown) {
      filters.push([col, val]);
      return chain;
    },
    order() {
      return chain;
    },
    single() {
      return Promise.resolve(resolve(true));
    },
    then<T>(onFulfilled: (v: DbResult) => T, onRejected?: (e: unknown) => T) {
      return Promise.resolve(resolve(false)).then(onFulfilled, onRejected);
    },
  };
  return chain;
}

jest.mock("@/lib/supabase/server", () => ({
  createServerClient: () => ({ from: (table: string) => fakeQuery(table) }),
}));

import { GET, POST } from "@/app/api/points/route";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const EXEC = { email: "exec@illinois.edu", role: "exec", memberId: "e-1" };
const MEMBER = { email: "priya@illinois.edu", role: "member", memberId: "m-1" };

function entry(member_id: string, delta: number, category?: string): Row {
  return {
    id: `seed-${db.entries.length + 1}`,
    member_id,
    delta,
    reason: "seeded",
    created_at: "2026-09-10T00:00:00.000Z",
    ...(category ? { category } : {}),
  };
}

function award(body: Record<string, unknown>) {
  return POST(
    new NextRequest("https://portal.test/api/points", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    })
  );
}

beforeEach(() => {
  mockSession = { user: EXEC };
  db.members = [
    { id: "m-1", full_name: "Priya Raman", email: "priya@illinois.edu", role: "member" },
    { id: "m-2", full_name: "Sam Ortiz", email: "sam@illinois.edu", role: "returning_member" },
    { id: "e-1", full_name: "Exec Person", email: "exec@illinois.edu", role: "exec" },
  ];
  db.entries = [];
  db.inserts = [];
  db.categoryColumn = true;
});

// ── The board ────────────────────────────────────────────────────────────────

describe("GET /api/points", () => {
  it("breaks each member's total down by category", async () => {
    db.entries = [entry("m-1", 2, "professional"), entry("m-1", 1, "social"), entry("m-1", -1, "professional")];

    const body = await (await GET()).json();
    const priya = body.rows.find((r: { member_id: string }) => r.member_id === "m-1");

    expect(priya).toMatchObject({ points: 2, categories: { fundamentals: 0, professional: 1, social: 1 } });
    expect(body.categoriesMissing).toBe(false);
    expect(body.entries[0]).toHaveProperty("category");
  });

  it("still shows the board when db/point-categories.sql hasn't been run", async () => {
    db.categoryColumn = false;
    db.entries = [entry("m-1", 3)];

    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.categoriesMissing).toBe(true);
    expect(body.ledgerMissing).toBeUndefined();
    expect(body.rows.find((r: { member_id: string }) => r.member_id === "m-1")).toMatchObject({
      points: 3,
      uncategorized: 3,
    });
  });
});

// ── Awarding ─────────────────────────────────────────────────────────────────

describe("POST /api/points", () => {
  it("is exec-only", async () => {
    mockSession = { user: MEMBER };
    expect((await award({ member_id: "m-2", delta: 1, reason: "x", category: "social" })).status).toBe(403);
    expect(db.inserts).toHaveLength(0);
  });

  it("requires a category", async () => {
    const res = await award({ member_id: "m-1", delta: 1, reason: "Coffee chat" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Pick a category/);
    expect(db.inserts).toHaveLength(0);
  });

  it("refuses a category that isn't one of the three", async () => {
    expect((await award({ member_id: "m-1", delta: 1, reason: "x", category: "leadership" })).status).toBe(400);
    expect(db.inserts).toHaveLength(0);
  });

  it("records the category on the ledger entry and returns the new breakdown", async () => {
    db.entries = [entry("m-2", 1, "social")];
    const res = await award({ member_id: "m-2", delta: 2, reason: "Ran the mock case night", category: "professional" });

    expect(res.status).toBe(201);
    expect(db.inserts[0]).toMatchObject({ member_id: "m-2", delta: 2, category: "professional", awarded_by: "e-1" });
    expect(await res.json()).toMatchObject({ total: 3, categories: { fundamentals: 0, professional: 2, social: 1 } });
  });

  it("deducts within a category", async () => {
    db.entries = [entry("m-1", 3, "social")];
    const res = await award({ member_id: "m-1", delta: -1, reason: "Duplicate award", category: "social" });

    expect(res.status).toBe(201);
    expect((await res.json()).categories.social).toBe(2);
  });

  it("refuses to award until the category column exists, rather than dropping the category", async () => {
    db.categoryColumn = false;
    const res = await award({ member_id: "m-1", delta: 1, reason: "Coffee chat", category: "social" });

    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/point-categories\.sql/);
    expect(db.inserts).toHaveLength(0);
  });
});
