import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).transform((value) => value || null);

export const customerCreateSchema = z.object({
  customerCode: z.string().trim().min(1, "顧客コードを入力してください").max(80, "顧客コードは80文字以内で入力してください"),
  internalName: z.string().trim().min(1, "内部管理名を入力してください").max(120, "内部管理名は120文字以内で入力してください"),
  note: optionalText(2000),
  rankingOptIn: z.boolean(),
  nickname: z.string().trim().max(60).optional().transform((value) => value || ""),
  profileVisible: z.boolean(),
}).superRefine((value, context) => {
  if (value.rankingOptIn && !value.nickname) {
    context.addIssue({ code: "custom", path: ["nickname"], message: "公開ニックネームを入力してください" });
  }
});

export const customerUpdateSchema = z.object({
  customerCode: z.string().trim().min(1, "顧客コードを入力してください").max(80, "顧客コードは80文字以内で入力してください"),
  internalName: z.string().trim().min(1, "内部管理名を入力してください").max(120, "内部管理名は120文字以内で入力してください"),
  note: optionalText(2000),
  rankingOptIn: z.boolean(),
  nickname: z.string().trim().max(60).optional().transform((value) => value || ""),
  profileVisible: z.boolean(),
}).superRefine((value, context) => {
  if (value.rankingOptIn && !value.nickname) {
    context.addIssue({ code: "custom", path: ["nickname"], message: "公開ニックネームを入力してください" });
  }
});

export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;

export function formBoolean(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true";
}
