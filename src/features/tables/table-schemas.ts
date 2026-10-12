import { z } from "zod";

const tableName = z.string().trim().min(1, "卓名を入力してください。").max(40);

export const createTableSchema = z.object({ name: tableName, sortOrder: z.number().int().min(0).max(10_000) });
export const updateTableSchema = z.object({ tableId: z.string().min(1), name: tableName, sortOrder: z.number().int().min(0).max(10_000) });
export const deactivateTableSchema = z.object({ tableId: z.string().min(1) });

const seatSchema = z.object({ visitId: z.string().min(1), position: z.number().int().min(1).max(4) });
export const startTableSessionSchema = z.object({
  tableId: z.string().min(1),
  seats: z.array(seatSchema).length(4),
}).superRefine(({ seats }, ctx) => {
  if (new Set(seats.map((seat) => seat.visitId)).size !== 4) {
    ctx.addIssue({ code: "custom", path: ["seats"], message: "4人の異なる顧客を選択してください。" });
  }
  if (new Set(seats.map((seat) => seat.position)).size !== 4) {
    ctx.addIssue({ code: "custom", path: ["seats"], message: "席番号1〜4をそれぞれ指定してください。" });
  }
});

export const endTableSessionSchema = z.object({ sessionId: z.string().min(1) });

