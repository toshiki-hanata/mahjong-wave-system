import { NextResponse,type NextRequest } from "next/server";
import { getCurrentStaff } from "@/lib/auth/current-staff";
import { reserveStaffAction } from "@/lib/auth/staff-action-quota";
import { prisma } from "@/lib/prisma";
import { isSameOriginMutation } from "@/lib/security/mutation-origin";
import { logSecurityEvent } from "@/lib/security/security-log";
import { readDailyReport } from "@/features/daily-reports/queries";
import { dailyReportCsv } from "@/features/daily-reports/csv";
import { ReportError,ReportPermissionError } from "@/features/daily-reports/policy";
export const dynamic="force-dynamic";
const privateHeaders={"Cache-Control":"private, no-store, max-age=0",Pragma:"no-cache",Vary:"Cookie","X-Content-Type-Options":"nosniff","X-Robots-Tag":"noindex, nofollow"};
const deny=(status:number)=>NextResponse.json({message:"日報の出力権限と営業日を確認してください。"},{status,headers:privateHeaders});
export async function GET(request:NextRequest,{params}:{params:Promise<{businessDayId:string}>}){
  if(process.env.DAILY_REPORTS_ENABLED!=="true")return deny(404);const origin=request.headers.get("origin");if(request.headers.get("sec-fetch-site")==="cross-site"||(origin&&!isSameOriginMutation(origin,request.nextUrl.origin,process.env.APP_ORIGIN)))return deny(403);
  try{const staff=await getCurrentStaff();if(!staff)return deny(401);if(staff.role!=="OWNER")return deny(403);if(!prisma)return deny(503);const{businessDayId}=await params;if(!businessDayId||businessDayId.length>200)return deny(400);if(!await reserveStaffAction(prisma,staff))return deny(429);const data=await readDailyReport(prisma,{storeId:staff.storeId,staffId:staff.id,sessionVersion:staff.sessionVersion},businessDayId,true),filename="mahjong-wave-daily-"+data.day.label.replace(/[^0-9-]/g,"")+".csv";const csv=dailyReportCsv(data);if(Buffer.byteLength(csv,"utf8")>4000000)throw new ReportError("出力上限を超えました。");return new NextResponse(csv,{headers:{...privateHeaders,"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="${filename}"`}});}catch(error){if(error instanceof ReportPermissionError)return deny(403);if(error instanceof ReportError)return deny(404);logSecurityEvent("REQUEST_ERROR","error");return deny(503);}
}
