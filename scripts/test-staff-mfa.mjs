// Explicitly enabled, marker-guarded disposable-schema integration verification.
import "dotenv/config";
import { spawn } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { withIsolatedStaffMfaEnvironment } from "./lib/isolated-staff-mfa.mjs";
const root = path.resolve(import.meta.dirname, ".."), outputDir = mkdtempSync(path.join(tmpdir(), "wave-mfa-test-")), resultFile = path.join(outputDir, "result.json");
try {
 await withIsolatedStaffMfaEnvironment(async ({ env }) => {
  const code = await new Promise(resolve => {
    const child = spawn(process.execPath, [path.join(root, "node_modules/vitest/vitest.mjs"), "run", "src/lib/auth/mfa/mfa-db.integration.test.ts", "--no-file-parallelism", "--maxWorkers=1", "--testTimeout=45000", "--hookTimeout=45000", "--reporter=json", "--outputFile=" + resultFile], { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    // Capture neither raw connection errors nor secret-bearing failed assertions in application logs.
    child.stdout.resume(); child.stderr.resume(); child.on("error", () => resolve(1)); child.on("close", resolve);
  });
  const result = JSON.parse(readFileSync(resultFile, "utf8"));
  const passed = code === 0 && result.success;
  const redact = value => {
    let text = value;
    for (const secret of Object.values(env).filter(v => typeof v === "string" && v.length >= 16)) text = text.split(secret).join("[REDACTED]");
    for (const value of [process.env.DATABASE_URL, process.env.DIRECT_URL]) if (value) { const u = new URL(value); for (const secret of [u.hostname, u.password, decodeURIComponent(u.password)].filter(Boolean)) text = text.split(secret).join("[REDACTED]"); }
    return text.replace(/[a-f0-9]{8}(?:-[a-f0-9]{8}){3}/gi, "[RECOVERY_CODE]").replace(/[A-Z2-7]{32,}/g, "[TOTP_SEED]").replace(/[A-Za-z0-9_-]{43,}/g, "[TOKEN]").replace(/\b\d{6}\b/g, "[OTP]");
  };
  console.log(JSON.stringify({ scope: "new-disposable-schema-only", success: passed, tests: result.numTotalTests, passed: result.numPassedTests, failed: result.numFailedTests,
    cases: result.testResults.flatMap(t => t.assertionResults.map(a => ({ title: a.title, status: a.status, ...(a.status === "failed" ? { diagnostics: redact(a.failureMessages.join("\n")) } : {}) }))) }));
  if (!passed) process.exitCode = 1;
 });
} catch {
 console.error("Isolated MFA verification could not complete. No raw connection or authentication values are printed.");
 process.exitCode = 1;
} finally { rmSync(resultFile, { force: true }); rmdirSync(outputDir); }
