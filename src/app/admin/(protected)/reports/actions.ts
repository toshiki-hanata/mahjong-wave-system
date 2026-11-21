"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/current-staff";
import { requireStaffActionPermit } from "@/lib/auth/staff-action-permit";
import { prisma } from "@/lib/prisma";
import { logSecurityEvent } from "@/lib/security/security-log";
import { ReportError } from "@/features/daily-reports/policy";
import { saveReportWorker, saveReportShift, recordReportCash, voidReportCash, voidReportShift } from "@/features/daily-reports/service";
export type ReportFormState={message?:string};
function failed(error:unknown):ReportFormState{if(error instanceof ReportError)return{message:error.message};logSecurityEvent("REQUEST_ERROR","error");return{message:"保存できませんでした。入力と最新の記録を確認して、もう一度お試しください。"};}
function maybe(f:FormData,k:string){const v=f.get(k);return typeof v==="string"&&v?v:undefined;}
function amount(f:FormData,k:string){const v=f.get(k);return typeof v==="string"&&v.trim()?Number(v):NaN;}
export async function saveWorkerAction(_state:ReportFormState,f:FormData):Promise<ReportFormState>{
  const staff=await requireRole(["OWNER"]);if(process.env.DAILY_REPORTS_ENABLED!=="true")return{message:"日報は準備中です。"};if(!prisma)return{message:"データベースを確認してください。"};await requireStaffActionPermit(staff);
  try{await saveReportWorker(prisma,{id:maybe(f,"id"),expectedRevision:maybe(f,"revision")?Number(f.get("revision")):undefined,requestKey:f.get("requestKey"),name:f.get("name"),hourlyRateYen:amount(f,"hourlyRateYen"),roundingMode:f.get("roundingMode"),nightRateBps:Math.round(amount(f,"nightRate")*100),overtimeRateBps:Math.round(amount(f,"overtimeRate")*100),holidayRateBps:Math.round(amount(f,"holidayRate")*100),overtimeAfterMinutes:amount(f,"overtimeAfterMinutes"),isActive:f.get("isActive")==="on",reason:f.get("reason")},{storeId:staff.storeId,staffId:staff.id,sessionVersion:staff.sessionVersion});}catch(error){return failed(error);}
  revalidatePath("/admin/reports");redirect("/admin/reports/workers?notice=saved");
}
export async function saveShiftAction(_state:ReportFormState,f:FormData):Promise<ReportFormState>{
  const staff=await requireRole(["OWNER"]);if(process.env.DAILY_REPORTS_ENABLED!=="true")return{message:"日報は準備中です。"};if(!prisma)return{message:"データベースを確認してください。"};await requireStaffActionPermit(staff);let dayId:string;
  try{if(String(f.get("breaks")??"").length>4000)return{message:"休憩の入力が多すぎます。"};const input={id:maybe(f,"id"),expectedRevision:maybe(f,"revision")?Number(f.get("revision")):undefined,requestKey:f.get("requestKey"),businessDayId:f.get("businessDayId"),workerId:f.get("workerId"),startedAtLocal:f.get("startedAtLocal"),endedAtLocal:f.get("endedAtLocal"),breaks:JSON.parse(String(f.get("breaks")??"[]")),statutoryHoliday:f.get("statutoryHoliday")==="on",refreshPayRule:f.get("refreshPayRule")==="on",reason:f.get("reason")};await saveReportShift(prisma,input,{storeId:staff.storeId,staffId:staff.id,sessionVersion:staff.sessionVersion});dayId=String(input.businessDayId);}catch(error){return failed(error);}
  revalidatePath("/admin/reports");redirect("/admin/reports/"+encodeURIComponent(dayId)+"?notice=saved");
}
export async function recordCashAction(_state:ReportFormState,f:FormData):Promise<ReportFormState>{
  const staff=await requireRole(["OWNER"]);if(process.env.DAILY_REPORTS_ENABLED!=="true")return{message:"日報は準備中です。"};if(!prisma)return{message:"データベースを確認してください。"};await requireStaffActionPermit(staff);let dayId:string;
  try{const input={requestKey:f.get("requestKey"),businessDayId:f.get("businessDayId"),kind:f.get("kind"),workerId:maybe(f,"workerId"),amountYen:amount(f,"amountYen"),description:f.get("description"),occurredAtLocal:f.get("occurredAtLocal")};await recordReportCash(prisma,input,{storeId:staff.storeId,staffId:staff.id,sessionVersion:staff.sessionVersion});dayId=String(input.businessDayId);}catch(error){return failed(error);}
  revalidatePath("/admin/reports");redirect("/admin/reports/"+encodeURIComponent(dayId)+"?notice=saved");
}
export async function voidCashAction(_state:ReportFormState,f:FormData):Promise<ReportFormState>{
  const staff=await requireRole(["OWNER"]);if(process.env.DAILY_REPORTS_ENABLED!=="true")return{message:"日報は準備中です。"};if(!prisma)return{message:"データベースを確認してください。"};await requireStaffActionPermit(staff);let dayId:string;
  try{const input={requestKey:f.get("requestKey"),businessDayId:f.get("businessDayId"),entryId:f.get("entryId"),reason:f.get("reason")};await voidReportCash(prisma,input,{storeId:staff.storeId,staffId:staff.id,sessionVersion:staff.sessionVersion});dayId=String(input.businessDayId);}catch(error){return failed(error);}
  revalidatePath("/admin/reports");redirect("/admin/reports/"+encodeURIComponent(dayId)+"?notice=voided");
}

export async function voidShiftAction(_state:ReportFormState,f:FormData):Promise<ReportFormState>{const staff=await requireRole(["OWNER"]);if(process.env.DAILY_REPORTS_ENABLED!=="true"||!prisma)return{message:"日報を確認してください。"};await requireStaffActionPermit(staff);let dayId:string;try{const input={requestKey:f.get("requestKey"),businessDayId:f.get("businessDayId"),entryId:f.get("entryId"),reason:f.get("reason")};await voidReportShift(prisma,{...input,expectedRevision:Number(f.get("expectedRevision"))},{storeId:staff.storeId,staffId:staff.id,sessionVersion:staff.sessionVersion});dayId=String(input.businessDayId);}catch(error){return failed(error);}revalidatePath("/admin/reports");redirect("/admin/reports/"+encodeURIComponent(dayId)+"?notice=voided");}
