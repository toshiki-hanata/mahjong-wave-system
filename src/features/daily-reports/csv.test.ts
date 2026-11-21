import { describe,it,expect } from "vitest";
import fs from "node:fs";
import { csvCell,encodeCsv } from "./csv";
describe("private report CSV and migration integrity",()=>{
 it.each(["=1+1","+SUM(1,2)","-cmd|'x'!A1","@SUM(1,2)"," \t\r=1","＝1","＋1","－1","＠SUM(1)"])("neutralizes a text formula %s",value=>expect(csvCell(value).startsWith('"\'')).toBe(true));
 it("preserves numeric negatives while neutralizing text and quotes/newlines",()=>{expect(csvCell(-5000)).toBe('"-5000"');expect(csvCell('架空,"会員"\n次の行')).toBe('"架空,""会員""\n次の行"');expect(()=>csvCell(NaN)).toThrow();expect(encodeCsv([["名前","金額"],["架空",1200]])).toBe('\uFEFF"名前","金額"\r\n"架空","1200"\r\n');});
 it("does not duplicate foreign key constraints or change existing tables",()=>{const sql=fs.readFileSync("prisma/migrations/20261121200000_owner_daily_reports/migration.sql","utf8"),constraints=[...sql.matchAll(/ALTER TABLE "([^"]+)" ADD CONSTRAINT "([^"]+)"/g)].map(m=>m[1]+":"+m[2]);expect(new Set(constraints).size).toBe(constraints.length);expect(constraints.every(c=>c.startsWith("DailyReport"))).toBe(true);expect(sql.trim().startsWith("BEGIN;")).toBe(true);expect(sql.trim().endsWith("COMMIT;")).toBe(true);expect(sql).not.toMatch(/^\s*(DROP|DELETE|UPDATE|TRUNCATE)\b/im);});
});
