import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";
import { readDailyReport } from "@/features/daily-reports/queries";
import { ReportView } from "@/features/daily-reports/report-view";
import { PrintReportButton } from "@/features/daily-reports/forms";
export default async function PrintPage({params}:{params:Promise<{businessDayId:string}>}){const staff=await requireRole(["OWNER"]),{businessDayId}=await params;if(!prisma||businessDayId.length>200)notFound();const data=await readDailyReport(prisma,{storeId:staff.storeId,staffId:staff.id,sessionVersion:staff.sessionVersion},businessDayId,true);return <div className="page-content business-page report-print-view"><div className="business-links report-no-print"><PrintReportButton/><Link className="button button-secondary" href={`/admin/reports/${data.day.id}`}>記録画面へ戻る</Link></div><ReportView data={data}/></div>;}
