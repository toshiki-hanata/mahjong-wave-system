import { z } from "zod";

export const checkInVisitSchema = z.object({
  customerId: z.string().trim().min(1).max(128),
});

export const visitIdSchema = z.object({
  visitId: z.string().trim().min(1).max(128),
});

export type CheckInVisitInput = z.infer<typeof checkInVisitSchema>;
