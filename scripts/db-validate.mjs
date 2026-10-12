import { spawnSync } from "node:child_process";

if (!process.env.DATABASE_URL) {
  console.log("DATABASE_URL is not configured; Prisma schema validation was skipped without inventing a database URL.");
  process.exit(0);
}

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["prisma", "validate"], { stdio: "inherit", shell: process.platform === "win32" });
process.exit(result.status ?? 1);
