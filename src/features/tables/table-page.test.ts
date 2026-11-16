import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Role } from "@prisma/client";
import TablesPage from "@/app/admin/(protected)/tables/page";
import { getTablePageData } from "./table-queries";
import { requireRole } from "@/lib/auth/current-staff";
import { tableOperationRoles } from "./table-permissions";

const fixture = vi.hoisted(() => ({ database: {} as object | null }));
vi.mock("@/lib/prisma", () => ({ get prisma() { return fixture.database; } }));
vi.mock("@/lib/auth/current-staff", () => ({ requireRole: vi.fn() }));
vi.mock("./table-queries", () => ({ getTablePageData: vi.fn() }));
vi.mock("./table-actions", () => ({ CreateTableForm: () => null, DeactivateTableForm: () => null, EndTableForm: () => null, StartTableForm: () => null, TableMasterForm: () => null }));
vi.mock("./member-change-form", () => ({ MemberChangeForm: () => null }));

type PageData = Awaited<ReturnType<typeof getTablePageData>>;
const staff = { id: "fixture-staff", storeId: "fixture-store", name: "架空スタッフ", storeName: "架空店舗", storeTimezone: "Asia/Tokyo", role: Role.STAFF, sessionVersion: 0, sessionIssuedAt: Date.now(), sessionLastActiveAt: Date.now() };
function table(index: number, free = false, active = true): PageData["tables"][number] {
  return { id: `fixture-table-${index}`, name: `検証卓${index}`, sortOrder: index, isActive: active, sessions: free ? [{ id: `fixture-session-${index}`, startedAt: new Date("2026-11-16T03:00:00Z"), _count: { games: 1 }, seats: [] }] : [] };
}
async function render(params: { state?: string | string[]; inactive?: string } = {}) {
  return renderToStaticMarkup(await TablesPage({ searchParams: Promise.resolve(params) }));
}
beforeEach(() => {
  vi.clearAllMocks(); fixture.database = {};
  vi.mocked(requireRole).mockResolvedValue(staff);
  vi.mocked(getTablePageData).mockResolvedValue({ tables: [...Array.from({ length: 8 }, (_, i) => table(i + 1, i >= 5)), table(99, false, false)], waitingVisits: [], recentSessions: [] });
});

describe("table list for store operations", () => {
  it("uses configured table counts rather than a fixed seven, excluding archived tables", async () => {
    const html = await render();
    expect(html.match(/<h3>/g)).toHaveLength(8);
    expect(html).toContain("すべての営業卓</span><strong>8<small>");
    expect(html).toContain("空き卓</span><strong>5<small>");
    expect(html).toContain("フリー</span><strong>3<small>");
    expect(html).not.toContain("検証卓99");
    expect(requireRole).toHaveBeenCalledWith(tableOperationRoles);
    expect(getTablePageData).toHaveBeenCalledWith(fixture.database, staff.storeId);
  });
  it("filters available tables without changing the overview totals", async () => {
    const html = await render({ state: "available" });
    expect(html.match(/<h3>/g)).toHaveLength(5);
    expect(html).not.toContain("検証卓6");
    expect(html).toContain('href="/admin/tables?state=available" aria-current="page"');
    expect(html).toContain("フリー</span><strong>3<small>");
  });
  it("filters free tables and keeps result-entry links and start times", async () => {
    const html = await render({ state: "free" });
    expect(html.match(/<h3>/g)).toHaveLength(3);
    expect(html).not.toContain("<h3>検証卓1</h3>");
    expect(html).toContain("fixture-session-6/games/new");
    expect(html).toContain("フリー · 開始");
  });
  it("does not expose archived tables to STAFF even with a crafted URL", async () => {
    const html = await render({ inactive: "1" });
    expect(html).not.toContain("検証卓99");
    expect(html).not.toContain("卓マスタを編集");
    expect(html).not.toContain("保管・無効の卓");
    vi.mocked(requireRole).mockResolvedValue({ ...staff, role: Role.MANAGER });
    const manager = await render({ inactive: "1" });
    expect(manager).toContain("検証卓99");
    expect(manager).toContain('href="/admin/tables?state=free&amp;inactive=1"');
    const filtered = await render({ inactive: "1", state: "free" });
    expect(filtered).not.toContain("検証卓99");
  });
  it.each(["unknown", ["free", "available"]])("falls back to all tables for invalid or repeated filters: %s", async (state) => {
    const html = await render({ state });
    expect(html.match(/<h3>/g)).toHaveLength(8);
    expect(html).toContain('href="/admin/tables" aria-current="page"');
  });
  it("explains an empty filter and does not treat missing DB data as zero known tables", async () => {
    vi.mocked(getTablePageData).mockResolvedValue({ tables: [table(1)], waitingVisits: [], recentSessions: [] });
    expect(await render({ state: "free" })).toContain("現在、フリーで利用中の卓はありません。");
    vi.mocked(getTablePageData).mockResolvedValue({ tables: [table(1, true)], waitingVisits: [], recentSessions: [] });
    expect(await render({ state: "available" })).toContain("現在、空き卓はありません。");
    fixture.database = null;
    vi.mocked(getTablePageData).mockResolvedValue({ tables: [], waitingVisits: [], recentSessions: [] });
    const html = await render();
    expect(html).toContain("データベースに接続できません。");
    expect(html).toContain("空き卓</span><strong>—<small>");
  });
});
