import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { PrismaClient, Role } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password.ts";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required. No database URL was created or inferred.");
  process.exit(1);
}

if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
  console.error("Run this command in an interactive terminal so the password can be entered without echo.");
  process.exit(1);
}

const readline = createInterface({ input: stdin, output: stdout });
const prisma = new PrismaClient();

function askHidden(prompt) {
  stdout.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const onData = (chunk) => {
      const text = chunk.toString("utf8");
      if (text === "\u0003") {
        cleanup();
        reject(new Error("Cancelled."));
      } else if (text === "\r" || text === "\n") {
        cleanup();
        stdout.write("\n");
        resolve(value);
      } else if (text === "\u007f" || text === "\b") {
        value = value.slice(0, -1);
      } else if (text.length === 1 && text >= " ") {
        value += text;
      }
    };
    function cleanup() {
      stdin.off("data", onData);
      stdin.setRawMode(false);
    }
    stdin.on("data", onData);
  });
}

try {
  if (await prisma.staff.count() > 0) {
    throw new Error("Staff records already exist; the initial OWNER bootstrap only runs on an empty Staff table.");
  }

  const storeName = (await readline.question("Store name: ")).trim();
  const timezone = (await readline.question("Store timezone (IANA): ")).trim();
  const staffName = (await readline.question("Owner name: ")).trim();
  const loginId = (await readline.question("Owner login ID: ")).trim();
  if (!storeName || !timezone || !staffName || !loginId) throw new Error("All fields are required.");

  const password = await askHidden("Owner password (min 12 characters): ");
  const confirmation = await askHidden("Repeat password: ");
  if (password.length < 12) throw new Error("Password must be at least 12 characters.");
  if (password !== confirmation) throw new Error("Passwords did not match.");

  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const store = await tx.store.create({ data: { name: storeName, timezone, rankingSettings: { create: {} } } });
    const staff = await tx.staff.create({
      data: { storeId: store.id, name: staffName, loginId, passwordHash, role: Role.OWNER },
    });
    await tx.auditLog.create({
      data: { storeId: store.id, actorStaffId: staff.id, action: "STORE_INITIALIZED", entityType: "Store", entityId: store.id },
    });
  });
  console.log("Initial Store and OWNER account created. Keep the entered login ID private.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Owner setup failed.");
  process.exitCode = 1;
} finally {
  readline.close();
  await prisma.$disconnect();
}
