import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const protectedActions: Record<string, string[]> = {
  "business-days": ["updateBusinessDayTimesAction", "openBusinessDayAction", "closeBusinessDayAction", "updateFreeGamePriceAction"],
  "customers/[id]/link": ["issuePairingAction", "confirmStaffPairingAction", "cancelPairingAction"],
  "customers/[id]/points": ["adjustPointsAction", "reversePointsAction"],
  customers: ["createCustomerAction", "updateCustomerAction", "deactivateCustomerAction"],
  "customers/reconcile": ["previewRosterAction"],
  games: ["createStoreRuleAction", "createGameAction", "correctGameAction"],
  "security/mfa": ["replaceStaffMfaAction"],
  rankings: ["updateRankingSettingsAction"], "staff-games": ["checkInStaffParticipantAction"],
  "staff-sessions": ["revokeStaffSessionsAction"],
  tables: ["changeTableMembersAction", "createTableAction", "updateTableAction", "deactivateTableAction", "startTableSessionAction", "endTableSessionAction"],
  visits: ["quickReceptionAction", "checkInVisitAction", "checkOutVisitAction"],
};
const approved = new Set(Object.entries(protectedActions).flatMap(([dir, names]) => names.map(n => `src/app/admin/(protected)/${dir}/actions.ts:${n}`)).concat([
  "src/app/admin/mfa/actions.ts:verifyMfaAction", "src/app/admin/mfa/actions.ts:recoverMfaAction",
  "src/app/admin/mfa/actions.ts:acknowledgeMfaAction", "src/app/admin/mfa/actions.ts:cancelMfaAction",
  "src/app/admin/actions.ts:logoutAction", "src/app/admin/login/actions.ts:loginAction",
  "src/app/admin/session-actions.ts:refreshStaffSessionAction", "src/app/member/link/actions.ts:claimPairingAction",
  "src/app/member/link/actions.ts:readPairingAction", "src/app/member/link/actions.ts:confirmPairingAction",
]));
function list(dir: string): string[] { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? list(path.join(dir, e.name)) : [path.join(dir, e.name)]); }
describe("public entrypoint review stays complete", () => {
  it("requires an explicit security review entry for every Server Action and new Route Handler", () => {
    const seen = new Set<string>();
    const files = list(path.resolve("src/app"));
    expect(files.filter(f => /[\\/]route\.(?:ts|js)$/.test(f))).toEqual([]);
    for (const file of files.filter(f => /\.(ts|tsx)$/.test(f))) {
      const source = fs.readFileSync(file, "utf8"); if (!/^["']use server["']/.test(source)) continue;
      const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      for (const node of ast.statements) {
        if (!ts.isFunctionDeclaration(node) || !node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
        const relative = path.relative(process.cwd(), file).replaceAll("\\", "/");
        seen.add(relative + ":" + node.name!.text);
        if (relative.includes("/(protected)/")) {
          const body = node.body!.getText(ast);
          expect(body, relative).toMatch(/await require(?:Staff|Role)\(/);
          expect(body, relative).toMatch(/await requireStaffActionPermit\((?:staff|actor)\)/);
        }
      }
    }
    expect([...seen].sort()).toEqual([...approved].sort());
  });
});
