import "server-only";
import { Prisma, type PrismaClient } from "@prisma/client";
import { authorizeReportOwner, requireReportDay, type ReportActor } from "./service";
import { calculateReportWage, type WorkBreak } from "./payroll";
import { CASH_KINDS, type CashKind, ReportError } from "./policy";
export async function reportIndex(db:PrismaClient,actor:ReportActor,label?:string){return db.$transaction(async tx=>{await authorizeReportOwner(tx,actor);return tx.businessDay.findMany({where:{storeId:actor.storeId,...(label&&/^\d{4}-\d\d-\d\d$/.test(label)?{label}:{})},orderBy:[{openedAt:"desc"},{id:"desc"}],take:120,select:{id:true,label:true,openedAt:true,closedAt:true,timezone:true}});});}
export async function reportWorkers(db:PrismaClient,actor:ReportActor){return db.$transaction(async tx=>{await authorizeReportOwner(tx,actor);return tx.dailyReportWorker.findMany({where:{storeId:actor.storeId},orderBy:[{isActive:"desc"},{name:"asc"},{id:"asc"}],take:500});});}
export async function readDailyReport(db:PrismaClient,actor:ReportActor,dayId:string,exportAudit=false){
  return db.$transaction(async tx=>{
    const owner=await authorizeReportOwner(tx,actor),day=await requireReportDay(tx,actor,dayId);
    const[games,visits,shifts,cash,workers]=await Promise.all([
      tx.game.findMany({where:{storeId:actor.storeId,businessDayId:day.id,status:"CONFIRMED"},orderBy:[{effectiveAt:"asc"},{id:"asc"}],take:5001,select:{id:true,freeGamePriceYen:true,effectiveAt:true,sequenceNumber:true,tableSession:{select:{mahjongTable:{select:{name:true}}}}}}),
      tx.visit.findMany({where:{storeId:actor.storeId,businessDayId:day.id,customer:{is:{participantStaffId:null}}},orderBy:[{checkedInAt:"asc"},{id:"asc"}],take:5001,select:{id:true,customerId:true,checkedInAt:true,checkedOutAt:true,status:true,customer:{select:{internalName:true,customerCode:true}}}}),
      tx.dailyReportShift.findMany({where:{storeId:actor.storeId,businessDayId:day.id},orderBy:[{startedAt:"asc"},{id:"asc"}],take:501}),
      tx.dailyReportCashEntry.findMany({where:{storeId:actor.storeId,businessDayId:day.id},orderBy:[{occurredAt:"asc"},{id:"asc"}],take:2001}),
      tx.dailyReportWorker.findMany({where:{storeId:actor.storeId},orderBy:[{isActive:"desc"},{name:"asc"}],take:500}),
    ]);
    if(games.length>5000||visits.length>5000||shifts.length>500||cash.length>2000)throw new ReportError("1営業日の出力上限を超えています。記録を省略せず停止しました。");
    const workTotals=new Map<string,number>();
    const shiftRows=shifts.map(shift=>{const previous=workTotals.get(shift.workerId)??0;const wage=shift.endedAt&&!shift.voidedAt?calculateReportWage(shift.startedAt,shift.endedAt,shift.breaks as WorkBreak[],shift.ruleSnapshot,day.timezone,shift.statutoryHoliday,previous):null;if(wage)workTotals.set(shift.workerId,previous+wage.workedMinutes);return{...shift,wage};});
    const activeCash=cash.filter(c=>!c.voidedAt),workerIds=[...new Set([...shifts.filter(s=>!s.voidedAt).map(s=>s.workerId),...activeCash.flatMap(c=>c.workerId?[c.workerId]:[])])];
    const labor=workerIds.map(id=>{const list=shiftRows.filter(s=>s.workerId===id&&!s.voidedAt),money=activeCash.filter(c=>c.workerId===id),sum=(kind:string)=>money.filter(c=>c.kind===kind).reduce((a,c)=>a+c.amountYen,0),outYen=sum("STAFF_OUT"),returnedYen=sum("STAFF_RETURN"),paidYen=sum("PAYROLL_PAID"),pending=list.length===0||list.some(s=>!s.wage),grossYen=pending?null:list.reduce((a,s)=>a+s.wage!.grossYen,0),netOutYen=outYen-returnedYen,payableYen=grossYen===null?null:grossYen-netOutYen;
      return{id,name:list[0]?.workerName??money[0]?.workerName??workers.find(w=>w.id===id)?.name??"従業員",shifts:list.length,workedMinutes:list.reduce((a,s)=>a+(s.wage?.workedMinutes??0),0),paidMinutes:list.reduce((a,s)=>a+(s.wage?.paidMinutes??0),0),pending,grossYen,outYen,returnedYen,netOutYen,payableYen,paidYen,balanceYen:payableYen===null?null:payableYen-paidYen};});
    const freeRevenueYen=games.reduce((a,g)=>a+(g.freeGamePriceYen??0),0),salesCash=activeCash.filter(c=>CASH_KINDS[c.kind as CashKind]?.sales).reduce((a,c)=>a+c.amountYen,0),otherInYen=activeCash.filter(c=>CASH_KINDS[c.kind as CashKind]?.direction==="IN"&&!CASH_KINDS[c.kind as CashKind].sales).reduce((a,c)=>a+c.amountYen,0),outYen=activeCash.filter(c=>CASH_KINDS[c.kind as CashKind]?.direction==="OUT").reduce((a,c)=>a+c.amountYen,0);
    if(exportAudit)await tx.auditLog.create({data:{storeId:actor.storeId,actorStaffId:actor.staffId,action:"DAILY_REPORT_EXPORT",entityType:"BusinessDay",entityId:day.id,metadata:{visits:visits.length,shifts:shifts.length,cashEntries:cash.length}}});
    return{storeName:owner.store.name,day,generatedAt:new Date(),games,visits,shifts:shiftRows,cash,workers,labor,summary:{freeGames:games.length,freeRevenueYen,missingGamePrice:games.filter(g=>g.freeGamePriceYen===null).length,visitCount:visits.length,customerCount:new Set(visits.map(v=>v.customerId)).size,salesYen:freeRevenueYen+salesCash,otherInYen,outYen,balanceYen:freeRevenueYen+salesCash+otherInYen-outYen,pendingWages:labor.filter(l=>l.pending).length,grossYen: labor.some(l=>l.pending)?null:labor.reduce((a,l)=>a+(l.grossYen??0),0)}};
  },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,maxWait:10000,timeout:30000});
}
export type DailyReport=Awaited<ReturnType<typeof readDailyReport>>;
