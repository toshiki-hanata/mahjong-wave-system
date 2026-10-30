import { z } from "zod";

export function normalizeReceptionName(value: string): string {
  return value.trim().replace(/[\s\u3000]+/gu, " ");
}

export function receptionNameKey(value: string): string {
  return normalizeReceptionName(value).replace(/ /g, "").toLowerCase();
}

export const quickReceptionSchema = z.object({
  requestId: z.uuid(),
  internalName: z.string().transform(normalizeReceptionName).pipe(
    z.string().min(1, "お名前・呼び名を入力してください。").max(120, "お名前は120文字以内で入力してください。"),
  ),
  confirmDifferentPerson: z.boolean(),
});

export type QuickReceptionInput = z.infer<typeof quickReceptionSchema>;
