"use server";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { assertRuntimeDatabaseRole } from "@/lib/security/database-role";
import { isSameOriginMutation } from "@/lib/security/mutation-origin";
import { logSecurityEvent } from "@/lib/security/security-log";
import { BusinessDayClosedError, BusinessDayNotFoundError } from "@/features/business-days/business-day-service";
import { qrReceptionEnabled, receptionOrigin, receptionCookieName, QR_RECEPTION_POLICY, storeIdSchema, submissionSchema } from "@/features/qr-reception/policy";
import { submitReceptionRequest, QrReceptionError } from "@/features/qr-reception/service";

export type ReceptionFormState = { message?: string; success?: boolean };
export async function submitQrReceptionAction(storeId: string, key: string, _previous: ReceptionFormState, form: FormData): Promise<ReceptionFormState> {
  if (!qrReceptionEnabled() || !prisma || !storeIdSchema.safeParse(storeId).success || typeof key !== "string" || key.length > 90) return { message: "QR受付は利用できません。店員にお声がけください。" };
  const parsed = submissionSchema.safeParse({ name: form.get("name"), token: form.get("token") });
  if (!parsed.success) return { message: "お名前・呼び名を120文字以内で入力してください。" };
  const request = await headers();
  if (!isSameOriginMutation(request.get("origin"), receptionOrigin(), receptionOrigin())) return { message: "操作元を確認できません。QRを読み取り直してください。" };
  try {
    await assertRuntimeDatabaseRole(prisma);
    const address = process.env.VERCEL === "1" ? request.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown" : "unknown";
    await submitReceptionRequest(prisma, storeId, key, parsed.data, process.env.SESSION_SECRET ?? "", address);
    (await cookies()).set(receptionCookieName(storeId), parsed.data.token, { httpOnly: true, secure: receptionOrigin().startsWith("https:"), sameSite: "lax", path: `/reception/${storeId}`, maxAge: QR_RECEPTION_POLICY.receiptSeconds });
  } catch (error) {
    if (error instanceof QrReceptionError) return { message: error.message };
    if (error instanceof BusinessDayClosedError || error instanceof BusinessDayNotFoundError) return { message: "現在は受付していません。店員にお声がけください。" };
    logSecurityEvent("REQUEST_ERROR", "error"); return { message: "申請できませんでした。入力を残したまま再度お試しいただくか、店員にお声がけください。" };
  }
  revalidatePath(`/reception/${storeId}`);
  revalidatePath("/admin/reception-qr");
  return { success: true };
}
