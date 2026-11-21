import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/current-staff";
import "@/features/daily-reports/reports.css";
export default async function ReportsLayout({children}:{children:React.ReactNode}){await requireRole(["OWNER"]);if(process.env.DAILY_REPORTS_ENABLED!=="true")notFound();return children;}
