import { z } from "zod";

const environmentSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  DIRECT_URL: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(32).optional(),
});

/** Validate only variables that have been supplied; Sprint 0 has no DB secret. */
export const environment = environmentSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL || undefined,
  DIRECT_URL: process.env.DIRECT_URL || undefined,
  SESSION_SECRET: process.env.SESSION_SECRET || undefined,
});
