import { describe, expect, it } from "vitest";
import { parseRoster, reconcileRoster, MAX_ROSTER_CHARACTERS, type RosterCustomer } from "./roster-reconciliation";

const customers: RosterCustomer[] = [
  { id: "a", internalName: "佐藤 太郎", customerCode: "W0001", isActive: true },
  { id: "b", internalName: "鈴木 花子", customerCode: "W0002", isActive: true },
  { id: "c", internalName: "鈴木花子", customerCode: "W0003", isActive: false },
  { id: "d", internalName: "田中 一郎", customerCode: "W0004", isActive: false },
];
function preview(text: string, data = customers) {
  const parsed = parseRoster(text);
  if (!parsed.ok) throw Error(parsed.message);
  return reconcileRoster(parsed.rows, data);
}

describe("Roster preview parsing", () => {
  it("accepts a BOM, Excel headings, blank lines, Japanese spaces and CRLF without losing line numbers", () => {
    expect(parseRoster("\uFEFF名前\t会員番号\r\n\r\n 佐藤　太郎 \t W0001 \r\n鈴木花子")).toEqual({ ok: true, rows: [
      { line: 3, name: "佐藤 太郎", customerCode: "W0001" }, { line: 4, name: "鈴木花子", customerCode: "" },
    ] });
  });
  it.each(["", "  \n\t", "名前\t会員番号", null, new Blob(["name"]), "a".repeat(MAX_ROSTER_CHARACTERS + 1), "x".repeat(121), "a\t" + "c".repeat(81), "a\tb\tc", "\tW0001", "a\u0000b"])("rejects malformed or excessive input %#", (text) => {
    expect(parseRoster(text).ok).toBe(false);
  });
  it("enforces the 200-person boundary", () => {
    expect(parseRoster(Array.from({ length: 200 }, (_, i) => `名前${i}`).join("\n")).ok).toBe(true);
    expect(parseRoster(Array.from({ length: 201 }, (_, i) => `名前${i}`).join("\n")).ok).toBe(false);
  });
});

describe("Roster candidate selection", () => {
  it("treats matching names as candidates only, includes disabled homonyms and never merges", () => {
    const before = structuredClone(customers);
    expect(preview("佐藤太郎\n鈴木　花子\n田中一郎\n未登録").map((row) => [row.status, row.candidateCount])).toEqual([["candidate", 1], ["ambiguous", 2], ["inactive", 1], ["not-found", 0]]);
    expect(customers).toEqual(before);
  });
  it("uses an exact member number only when its name also agrees", () => {
    expect(preview("鈴木花子\tW0002")[0]).toMatchObject({ status: "candidate", candidates: [{ id: "b" }] });
    expect(preview("鈴木花子\tW0003")[0]).toMatchObject({ status: "inactive", candidates: [{ id: "c" }] });
    const conflict = preview("佐藤太郎\tW0002")[0];
    expect(conflict.status).toBe("name-conflict");
    expect(conflict.candidates.map((customer) => customer.id)).toEqual(["b", "a"]);
  });
  it("does not silently replace missing or differently cased codes with a same-name match", () => {
    expect(preview("佐藤太郎\tW9999")[0]).toMatchObject({ status: "unknown-code", candidateCount: 1 });
    expect(preview("佐藤太郎\tw0001")[0].status).toBe("unknown-code");
  });
  it("flags repeated names and codes without removing rows or conflating homonyms", () => {
    const rows = preview("佐藤太郎\tW0001\n佐藤 太郎\tW0001\n別人\tW0001");
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.duplicateName)).toEqual([true, true, false]);
    expect(rows.every((row) => row.duplicateCode)).toBe(true);
    expect(rows[2].status).toBe("name-conflict");
  });
  it("returns the full candidate count but bounds display data", () => {
    const data = Array.from({ length: 8 }, (_, i) => ({ id: String(i), internalName: "同名", customerCode: `W${i}`, isActive: true }));
    expect(preview("同名", data)[0]).toMatchObject({ status: "ambiguous", candidateCount: 8 });
    expect(preview("同名", data)[0].candidates).toHaveLength(5);
  });
});
