import type { DailyReport } from "./queries";
import { CASH_KINDS, type CashKind, type PayRule } from "./policy";
import { businessLocalDateTime } from "@/features/business-days/business-day-time";
type Cell=string|number|null|undefined;
/** RFC4180 quoting, UTF-8 BOM for Excel, and text-only spreadsheet formula neutralization. */
export function csvCell(value:Cell):string{
  if(typeof value==="number"){if(!Number.isFinite(value)||!Number.isSafeInteger(value))throw Error("Invalid CSV number");return '"'+String(value)+'"';}
  let text=String(value??"").replace(/\u0000/g,"");
  if(/^[\s\u0001-\u001f\u007f\uFEFF]*[=+\-@＝＋－＠]/u.test(text))text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
}
export function encodeCsv(rows:readonly (readonly Cell[])[]):string{return "\uFEFF"+rows.map(row=>row.map(csvCell).join(",")).join("\r\n")+"\r\n";}
export function dailyReportCsv(report:DailyReport):string{
  const headers=["営業日","区分","氏名・項目","来店・出勤日時","退店・退勤日時","実働分","支給計算分","時給円","給与計算額円","アウト出金円","アウト戻入金円","差引アウト円","差引支給参考額円","給与支払記録円","差引残参考額円","入金記録円","出金記録円","売上記録円","フリー本数","来店実人数","会員番号","内容","状態"];
  const rows:Cell[][]=[headers],at=(d:Date|null)=>d?businessLocalDateTime(d,report.day.timezone).replace("T"," "):"";
  function row(type:string,name:string,values:Partial<Record<number,Cell>>){const r:Cell[]=Array(headers.length).fill("");r[0]=report.day.label;r[1]=type;r[2]=name;for(const[k,v]of Object.entries(values))r[Number(k)]=v;rows.push(r);}
  row("基本情報",report.storeName,{3:at(report.day.openedAt),4:at(report.day.closedAt),21:"出力 "+at(report.generatedAt),22:report.day.closedAt?"終了営業":"営業中・暫定"});
  row("集計","売上・入出金",{15:report.summary.otherInYen,16:report.summary.outYen,17:report.summary.salesYen,18:report.summary.freeGames,19:report.summary.customerCount,21:`フリー売上${report.summary.freeRevenueYen}円／受付${report.summary.visitCount}回／日報収支${report.summary.balanceYen}円`,22:report.summary.pendingWages||report.summary.missingGamePrice?"未確定あり":"記録済み"});
  for(const l of report.labor)row("勤務・給与集計",l.name,{5:l.workedMinutes,6:l.paidMinutes,8:l.grossYen,9:l.outYen,10:l.returnedYen,11:l.netOutYen,12:l.payableYen,13:l.paidYen,14:l.balanceYen,22:l.pending?"勤務未確定":"日報参考計算"});
  for(const s of report.shifts){const p=s.ruleSnapshot as PayRule,rest=(s.breaks as {start:string;end:string}[]).map(b=>at(new Date(b.start))+"～"+at(new Date(b.end))).join("／");row("勤務明細",s.workerName,{3:at(s.startedAt),4:at(s.endedAt),5:s.wage?.workedMinutes,6:s.wage?.paidMinutes,7:p.hourlyRateYen,8:s.wage?.grossYen,21:"深夜"+(s.wage?.nightMinutes??0)+"分（加算"+(p.nightRateBps/100)+"％）／時間外"+(s.wage?.overtimeMinutes??0)+"分（基準"+p.overtimeAfterMinutes+"分・加算"+(p.overtimeRateBps/100)+"％）／"+(s.statutoryHoliday?"法定休日":"通常日")+"（休日加算"+(p.holidayRateBps/100)+"％）／"+(p.roundingMode==="CEIL_15"?"支給計算15分切上げ":"丸めなし")+"／休憩："+(rest||"記録なし"),22:s.voidedAt?"取消（集計対象外）":s.endedAt?"退勤済み":"未退勤"});}
  for(const c of report.cash){const kind=CASH_KINDS[c.kind as CashKind];row("入出金明細",c.workerName??kind.label,{3:at(c.occurredAt),15:kind.direction==="IN"?c.amountYen:"",16:kind.direction==="OUT"?c.amountYen:"",21:kind.label+"／"+c.description+(c.voidReason?"／取消理由："+c.voidReason:""),22:c.voidedAt?"取消（集計対象外）":"有効"});}
  for(const g of report.games)row("フリー明細",g.tableSession.mahjongTable.name,{3:at(g.effectiveAt),17:g.freeGamePriceYen,18:1,21:g.sequenceNumber+"本目",22:g.freeGamePriceYen===null?"単価未記録":"確定"});
  for(const v of report.visits)row("来店明細",v.customer.internalName,{3:at(v.checkedInAt),4:at(v.checkedOutAt),20:v.customer.customerCode,22:v.checkedOutAt?"退店済み":"来店中"});
  row("注記","集計範囲",{21:"営業開始～終了を1営業日として集計。訂正前の半荘・取消入出金は集計対象外。同日再来店は明細ごとに残し実人数は重複除外。スタッフの対局参加は来客人数から除外。"});
  row("注記","給与・精算",{21:"日報用の参考計算。週/月単位の時間外・税・社会保険等は別途確認。出金と戻し入金は別記録。前貸しの相殺・支払確定を自動実行しない。"});return encodeCsv(rows);
}
