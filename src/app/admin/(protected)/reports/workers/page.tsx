import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/auth/current-staff";
import { prisma } from "@/lib/prisma";
import { reportWorkers } from "@/features/daily-reports/queries";
import { WorkerForm } from "@/features/daily-reports/forms";
export default async function WorkersPage({searchParams}:{searchParams:Promise<{notice?:string}>}){const staff=await requireRole(["OWNER"]);if(!prisma)return<p>データベースを確認してください。</p>;const workers=await reportWorkers(prisma,{storeId:staff.storeId,staffId:staff.id,sessionVersion:staff.sessionVersion}),{notice}=await searchParams;return <div className="page-content business-page"><h1>従業員・時給の設定</h1><p>ログインアカウントを作らずに、給与記録用の従業員を登録できます。登録済み勤務の単価は当時の設定を保持します。</p><Link className="button button-secondary" href="/admin/reports">日報一覧へ</Link>{notice==="saved"&&<p className="business-success" role="status">従業員設定を保存しました。</p>}<details className="panel business-panel"><summary>従業員を追加する</summary><WorkerForm requestKey={randomUUID()}/></details>{workers.map(w=><details className="panel business-panel" key={w.id}><summary>{w.name} ／ 時給{w.hourlyRateYen.toLocaleString("ja-JP")}円{!w.isActive&&" ／ 無効"}</summary><WorkerForm key={w.id+"-"+w.revision} worker={w} requestKey={randomUUID()}/></details>)}<p className="report-note">設定した深夜・日単位時間外・法定休日の加算を日報参考額へ反映します。週/月単位の時間外、税・保険・控除等を含む給与確定は別途確認してください。</p></div>;}
