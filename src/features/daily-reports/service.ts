import "server-only";
import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { lockBusinessStore } from "@/features/business-days/business-day-service";
import { parseBusinessLocalDateTime } from "@/features/business-days/business-day-time";
import { recordAuditLog } from "@/lib/audit-log";
import { CASH_KINDS, workerInputSchema, shiftInputSchema, cashInputSchema, voidCashSchema, voidShiftSchema, reportId, payRuleSchema, ReportError, ReportPermissionError } from "./policy";
import { validateWorkPeriod } from "./payroll";
export type ReportActor = { storeId: string; staffId: string; sessionVersion: number };
export async function authorizeReportOwner(tx: Prisma.TransactionClient, actor: ReportActor) {
  const owner = await tx.staff.findFirst({ where: { id: actor.staffId, storeId: actor.storeId, role: "OWNER", sessionVersion: actor.sessionVersion, isActive: true, store: { isActive: true } }, select: { id: true, store: { select: { name: true, timezone: true } } } });
  if (!owner) throw new ReportPermissionError(); return owner;
}
export async function requireReportDay(tx: Prisma.TransactionClient, actor: ReportActor, id: string) {
  const day = await tx.businessDay.findFirst({ where: { id: reportId(id), storeId: actor.storeId } }); if (!day) throw new ReportError("指定された営業日を確認できません。"); return day;
}
function contextDate(value: string, timezone: string, day: { openedAt: Date }, allowFuture = false) {
  const date = parseBusinessLocalDateTime(value, timezone);
  if (Math.abs(date.getTime() - day.openedAt.getTime()) > 72*3600000 || (!allowFuture && date.getTime() > Date.now()+60000)) throw new ReportError("日時は営業開始の前後72時間以内で、未来にならないよう確認してください。"); return date;
}
async function mutate(db: Pick<PrismaClient,"$transaction">, actor: ReportActor, operation: string, input: unknown, requestKey: string, work: (tx: Prisma.TransactionClient) => Promise<{ id: string; before?: Prisma.InputJsonValue|null; after?: Prisma.InputJsonValue|null }>) {
  const inputHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return db.$transaction(async tx => {
    await lockBusinessStore(tx, actor.storeId); await authorizeReportOwner(tx, actor);
    const replay = await tx.dailyReportRequest.findUnique({ where: { storeId_requestKey: { storeId: actor.storeId, requestKey } } });
    if (replay) { if (replay.staffId !== actor.staffId || replay.operation !== operation || replay.inputHash !== inputHash) throw new ReportError("送信キーと記録内容が一致しません。画面を更新してください。"); return { id: replay.entityId, replayed: true }; }
    const result = await work(tx);
    await tx.dailyReportRequest.create({ data: { storeId: actor.storeId, staffId: actor.staffId, requestKey, operation, inputHash, entityId: result.id } });
    await recordAuditLog({ storeId: actor.storeId, actorStaffId: actor.staffId, action: "DAILY_REPORT_"+operation, entityType: "DailyReport", entityId: result.id, metadata: { before: result.before ?? null, after: result.after ?? null, requestKey } }, tx);
    return { id: result.id, replayed: false };
  }, { maxWait:10000, timeout:30000 });
}
export async function saveReportWorker(db: Pick<PrismaClient,"$transaction">, raw: unknown, actor: ReportActor) {
  const input = workerInputSchema.parse(raw);
  return mutate(db, actor, "WORKER_SAVE", input, input.requestKey, async tx => {
    const { id, expectedRevision } = input; const data = { name:input.name, ...payRuleSchema.parse(input), isActive:input.isActive };
    if(data.isActive && await tx.dailyReportWorker.count({where:{storeId:actor.storeId,name:data.name,isActive:true,...(id?{id:{not:id}}:{})}})) throw new ReportError("同じ名前の有効な従業員がいます。区別できる名前を入力してください。");
    if (id) {
      const old = await tx.dailyReportWorker.findFirst({ where: { id, storeId: actor.storeId } }); if (!old || old.revision !== expectedRevision) throw new ReportError("従業員設定が変更されています。画面を更新してください。");
      await tx.dailyReportWorker.update({ where: { id }, data: { ...data, revision: { increment:1 } } });
      return { id, before: { name: old.name, ...payRuleSchema.parse(old), isActive: old.isActive }, after: { ...data, reason: input.reason } };
    }
    if (await tx.dailyReportWorker.count({ where:{storeId:actor.storeId} }) >= 500) throw new ReportError("従業員の登録上限です。");
    const same = await tx.dailyReportWorker.count({ where:{storeId:actor.storeId,name:input.name,isActive:true} }); if (same) throw new ReportError("同じ名前の有効な従業員がいます。区別できる名前を入力してください。");
    const row = await tx.dailyReportWorker.create({ data:{storeId:actor.storeId,...data} }); return { id:row.id, after:{...data,reason:input.reason} };
  });
}
export async function saveReportShift(db: Pick<PrismaClient,"$transaction">, raw: unknown, actor: ReportActor) {
  const input = shiftInputSchema.parse(raw);
  return mutate(db, actor, "SHIFT_SAVE", input, input.requestKey, async tx => {
    const day = await requireReportDay(tx,actor,input.businessDayId), worker = await tx.dailyReportWorker.findFirst({where:{id:input.workerId,storeId:actor.storeId}}); if(!worker) throw new ReportError("従業員を確認してください。");
    const old = input.id ? await tx.dailyReportShift.findFirst({where:{id:input.id,storeId:actor.storeId,businessDayId:day.id}}) : null;
    if(input.id && (!old || old.voidedAt || old.revision!==input.expectedRevision || old.workerId!==input.workerId)) throw new ReportError("勤務記録が更新されています。画面を更新してください。");
    if(!old && !worker.isActive) throw new ReportError("無効な従業員の新規勤務は記録できません。");
    const startedAt=contextDate(input.startedAtLocal,day.timezone,day), endedAt=input.endedAtLocal?contextDate(input.endedAtLocal,day.timezone,day):null;
    const breaks=input.breaks.map(b=>({start:parseBusinessLocalDateTime(b.start,day.timezone).toISOString(),end:parseBusinessLocalDateTime(b.end,day.timezone).toISOString()}));validateWorkPeriod(startedAt,endedAt,breaks);
    const overlap=await tx.dailyReportShift.findFirst({where:{storeId:actor.storeId,workerId:worker.id,voidedAt:null,...(old?{id:{not:old.id}}:{}),...(endedAt?{startedAt:{lt:endedAt}}:{}),OR:[{endedAt:null},{endedAt:{gt:startedAt}}]},select:{id:true}});if(overlap)throw new ReportError("同じ従業員の勤務時間が重複しています。未退勤の記録も確認してください。");
    if(!old && await tx.dailyReportShift.count({where:{storeId:actor.storeId,businessDayId:day.id}})>=500)throw new ReportError("勤務記録の上限です。");
    const data={startedAt,endedAt,breaks,statutoryHoliday:input.statutoryHoliday};
    const row=old?await tx.dailyReportShift.update({where:{id:old.id},data:{...data,...(input.refreshPayRule?{ruleSnapshot:payRuleSchema.parse(worker)}:{}),revision:{increment:1}}}):await tx.dailyReportShift.create({data:{...data,storeId:actor.storeId,businessDayId:day.id,workerId:worker.id,workerName:worker.name,ruleSnapshot:payRuleSchema.parse(worker)}});
    return{id:row.id,before:old?{start:old.startedAt.toISOString(),end:old.endedAt?.toISOString()??null,breaks:old.breaks,ruleSnapshot:old.ruleSnapshot}:null,after:{start:startedAt.toISOString(),end:endedAt?.toISOString()??null,breaks,statutoryHoliday:input.statutoryHoliday,ruleSnapshot:row.ruleSnapshot,reason:input.reason}};
  });
}
async function ensureOutBalance(tx:Prisma.TransactionClient,actor:ReportActor,dayId:string,workerId:string,addition:{kind:string;amountYen:number},excludeId?:string){
  const rows=await tx.dailyReportCashEntry.groupBy({by:["kind"],where:{storeId:actor.storeId,businessDayId:dayId,workerId,voidedAt:null,...(excludeId?{id:{not:excludeId}}:{}),kind:{in:["STAFF_OUT","STAFF_RETURN"]}},_sum:{amountYen:true}});
  const out=(rows.find(r=>r.kind==="STAFF_OUT")?._sum.amountYen??0)+(addition.kind==="STAFF_OUT"?addition.amountYen:0),returned=(rows.find(r=>r.kind==="STAFF_RETURN")?._sum.amountYen??0)+(addition.kind==="STAFF_RETURN"?addition.amountYen:0);
  if(returned>out)throw new ReportError("戻し入金がこの営業日のアウト出金を超えます。元の出金と対象従業員を確認してください。");
}
export async function recordReportCash(db:Pick<PrismaClient,"$transaction">,raw:unknown,actor:ReportActor){
  const input=cashInputSchema.parse(raw);
  return mutate(db,actor,"CASH_CREATE",input,input.requestKey,async tx=>{
    const day=await requireReportDay(tx,actor,input.businessDayId), occurredAt=contextDate(input.occurredAtLocal,day.timezone,day), worker=input.workerId?await tx.dailyReportWorker.findFirst({where:{id:input.workerId,storeId:actor.storeId}}):null;
    if(CASH_KINDS[input.kind].worker&&!worker)throw new ReportError("対象の従業員を確認してください。");
    if(worker)await ensureOutBalance(tx,actor,day.id,worker.id,input);
    if(await tx.dailyReportCashEntry.count({where:{storeId:actor.storeId,businessDayId:day.id}})>=2000)throw new ReportError("入出金記録の上限です。");
    const row=await tx.dailyReportCashEntry.create({data:{storeId:actor.storeId,businessDayId:day.id,workerId:worker?.id,workerName:worker?.name,kind:input.kind,amountYen:input.amountYen,description:input.description,occurredAt}});return{id:row.id,after:{kind:input.kind,amountYen:input.amountYen,workerId:worker?.id??null,description:input.description,occurredAt:occurredAt.toISOString()}};
  });
}
export async function voidReportCash(db:Pick<PrismaClient,"$transaction">,raw:unknown,actor:ReportActor){
  const input=voidCashSchema.parse(raw);return mutate(db,actor,"CASH_VOID",input,input.requestKey,async tx=>{
    await requireReportDay(tx,actor,input.businessDayId);const old=await tx.dailyReportCashEntry.findFirst({where:{id:input.entryId,storeId:actor.storeId,businessDayId:input.businessDayId}});if(!old||old.voidedAt)throw new ReportError("すでに取消済み、または対象の記録を確認できません。");
    if(old.workerId)await ensureOutBalance(tx,actor,input.businessDayId,old.workerId,{kind:"NONE",amountYen:0},old.id);
    await tx.dailyReportCashEntry.update({where:{id:old.id},data:{voidedAt:new Date(),voidReason:input.reason}});return{id:old.id,before:{kind:old.kind,amountYen:old.amountYen},after:{voided:true,reason:input.reason}};
  });
}

export async function voidReportShift(db:Pick<PrismaClient,"$transaction">,raw:unknown,actor:ReportActor){
 const input=voidShiftSchema.parse(raw);return mutate(db,actor,"SHIFT_VOID",input,input.requestKey,async tx=>{await requireReportDay(tx,actor,input.businessDayId);const row=await tx.dailyReportShift.findFirst({where:{storeId:actor.storeId,businessDayId:input.businessDayId,id:input.entryId}});if(!row||row.voidedAt||row.revision!==input.expectedRevision)throw new ReportError("すでに取消済み、または対象の勤務を確認できません。");await tx.dailyReportShift.update({where:{id:row.id},data:{voidedAt:new Date(),voidReason:input.reason,revision:{increment:1}}});return{id:row.id,before:{start:row.startedAt.toISOString(),end:row.endedAt?.toISOString()??null},after:{voided:true,reason:input.reason}};});
}
