import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Prisma Client uses DATABASE_URL; Prisma CLI commands requiring a direct
  // connection use DIRECT_URL through Prisma 6's directUrl setting.
  datasource: {
    url: process.env.DATABASE_URL ?? "",
    directUrl: process.env.DIRECT_URL ?? "",
  },
});
