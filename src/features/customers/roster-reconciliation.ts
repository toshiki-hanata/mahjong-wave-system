import { normalizeReceptionName, receptionNameKey } from "@/features/visits/reception-schemas";

export const MAX_ROSTER_ROWS = 200;
export const MAX_ROSTER_CHARACTERS = 30_000;
export type RosterRow = { line: number; name: string; customerCode: string };
export type RosterCustomer = { id: string; internalName: string; customerCode: string; isActive: boolean };
export type RosterResult = RosterRow & {
  status: "candidate" | "ambiguous" | "not-found" | "unknown-code" | "name-conflict" | "inactive";
  duplicateName: boolean; duplicateCode: boolean; candidateCount: number; candidates: RosterCustomer[];
};

export function parseRoster(text: unknown): { ok: true; rows: RosterRow[] } | { ok: false; message: string } {
  if (typeof text !== "string" || text.length > MAX_ROSTER_CHARACTERS) return { ok: false, message: "名簿は30,000文字以内で貼り付けてください。" };
  const rows: RosterRow[] = [];
  const lines = text.replace(/^\uFEFF/, "").split(/\r\n|\n|\r/);
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index].trim()) continue;
    const cells = lines[index].split("\t");
    if (cells.length > 2) return { ok: false, message: `${index + 1}行目：名前と会員番号の2列までにしてください。` };
    const name = normalizeReceptionName(cells[0]);
    const customerCode = (cells[1] ?? "").trim();
    if (!rows.length && /^(名前|氏名|お名前)$/.test(name) && (!customerCode || /^(会員番号|顧客コード)$/.test(customerCode))) continue;
    if (!name || name.length > 120 || customerCode.length > 80 || /[\u0000-\u001f\u007f]/.test(cells.join(""))) return { ok: false, message: `${index + 1}行目：名前は1〜120文字、会員番号は80文字以内で入力してください。改行を含むセルは使えません。` };
    rows.push({ line: index + 1, name, customerCode });
    if (rows.length > MAX_ROSTER_ROWS) return { ok: false, message: "一度に照合できるのは200人までです。分けて貼り付けてください。" };
  }
  return rows.length ? { ok: true, rows } : { ok: false, message: "照合する名前を1行に1人ずつ貼り付けてください。" };
}

export function reconcileRoster(rows: RosterRow[], customers: RosterCustomer[]): RosterResult[] {
  const names = new Map<string, RosterCustomer[]>(), codes = new Map<string, RosterCustomer>();
  const repeatedNames = new Map<string, number>(), repeatedCodes = new Map<string, number>();
  for (const customer of customers) {
    const key = receptionNameKey(customer.internalName);
    names.set(key, [...(names.get(key) ?? []), customer]);
    codes.set(customer.customerCode, customer);
  }
  for (const row of rows) {
    const key = receptionNameKey(row.name);
    repeatedNames.set(key, (repeatedNames.get(key) ?? 0) + 1);
    if (row.customerCode) repeatedCodes.set(row.customerCode, (repeatedCodes.get(row.customerCode) ?? 0) + 1);
  }
  return rows.map((row) => {
    const key = receptionNameKey(row.name), byName = names.get(key) ?? [], byCode = codes.get(row.customerCode);
    let candidates = byName;
    let status: RosterResult["status"];
    if (row.customerCode && !byCode) status = "unknown-code";
    else if (byCode && receptionNameKey(byCode.internalName) !== key) {
      status = "name-conflict";
      candidates = [byCode, ...byName.filter((customer) => customer.id !== byCode.id)];
    } else if (byCode) {
      candidates = [byCode];
      status = byCode.isActive ? "candidate" : "inactive";
    } else if (!byName.length) status = "not-found";
    else if (byName.length > 1) status = "ambiguous";
    else status = byName[0].isActive ? "candidate" : "inactive";
    return { ...row, status, duplicateName: (repeatedNames.get(key) ?? 0) > 1, duplicateCode: Boolean(row.customerCode && (repeatedCodes.get(row.customerCode) ?? 0) > 1), candidateCount: candidates.length, candidates: candidates.slice(0, 5) };
  });
}
