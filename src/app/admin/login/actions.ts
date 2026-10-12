"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { authenticateStaff } from "@/lib/auth/credentials";
import { prisma } from "@/lib/prisma";
import { writeAdminSession } from "@/lib/auth/session";
import { headers } from "next/headers";
import { completeSuccessfulLogin, reserveLoginAttempt } from "@/lib/auth/login-rate-limit";

const loginSchema = z.object({
  loginId: z.string().trim().min(1, "ログインIDを入力してください。").max(120, "ログインIDが長すぎます。"),
  password: z.string().min(1, "パスワードを入力してください。").refine((value) => Buffer.byteLength(value, "utf8") <= 72, "パスワードが長すぎます。"),
});

export type LoginFormState = { message?: string; fieldErrors?: { loginId?: string[]; password?: string[] } };

export async function loginAction(_previous: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const parsed = loginSchema.safeParse({
    loginId: formData.get("loginId"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  if (!prisma) return { message: "認証データベースが設定されていません。管理者にお問い合わせください。" };
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    return { message: "認証設定が完了していません。管理者にお問い合わせください。" };
  }

  const database = prisma;
  try {
    const requestHeaders = await headers();
    // Vercel replaces x-forwarded-for at its trusted edge. Do not trust caller
    // supplied forwarding headers on other hosting environments.
    const clientAddress = process.env.VERCEL === "1"
      ? requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
      : "unknown";
    const reservation = await reserveLoginAttempt(database, parsed.data.loginId, clientAddress, process.env.SESSION_SECRET!);
    if (!reservation.allowed) return { message: "ログインIDまたはパスワードを確認してください。" };
    const staff = await authenticateStaff(parsed.data.loginId, parsed.data.password, {
      findByLoginId: async (loginId) => database.staff.findUnique({
        where: { loginId },
        include: { store: { select: { isActive: true } } },
      }),
    });
    if (reservation.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, reservation.delayMs));
    if (!staff) return { message: "ログインIDまたはパスワードを確認してください。" };

    await completeSuccessfulLogin(database, reservation);
    await writeAdminSession({ staffId: staff.id, storeId: staff.storeId, role: staff.role, sessionVersion: staff.sessionVersion });
  } catch {
    return { message: "ログインできませんでした。設定と接続状態を確認してください。" };
  }

  redirect("/admin");
}
