import XLSX from "xlsx";
import Project from "../models/Project.js";
import Worker from "../models/Worker.js";
import WorkerProject from "../models/WorkerProject.js";
import Transaction from "../models/Transaction.js";
import Week from "../models/Week.js";
import ProjectExpense from "../models/ProjectExpense.js";
import ProjectReceipt from "../models/ProjectReceipt.js";
import { calc, transactionTotals } from "../utils/calc.js";
import { date, days, dayNameArabic, monthRange, range, today, isFuture } from "../utils/date.js";
import { requireProjectId } from "../utils/project.js";

function fail(code, message, statusCode = 400) { throw Object.assign(new Error(message), { code, statusCode }); }
function money(v) { return Number(Number(v || 0).toFixed(2)); }
function setWidths(ws, widths) { ws["!cols"] = widths.map(w => ({ wch: w })); }
function makeWorkbook(sheets) {
  const wb = XLSX.utils.book_new();
  for (const [name, rows, widths] of sheets) {
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
    if (widths) setWidths(ws, widths);
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
  }
  return wb;
}
function sendWorkbook(res, wb, filename) {
  const buffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(buffer);
}
async function projectOrFail(projectId) {
  const p = await Project.findById(projectId).lean();
  if (!p) fail("PROJECT_NOT_FOUND", "Project not found", 404);
  return p;
}
function workerDayRows(weeks, workerId) {
  return weeks.flatMap(w => {
    const e = w.workers.find(x => x.workerId.toString() === workerId.toString());
    if (!e || e.deleted) return [];
    return e.days.map(d => ({ weekStart: w.weekStart, weekEnd: w.weekEnd, ...d }));
  }).sort((a,b) => a.date.localeCompare(b.date));
}
function workerSummary(daysList, txs) {
  const a = calc(daysList); const t = transactionTotals(txs);
  const totalDue = a.net + a.overtime + t.rewards - t.deductions;
  return { grossEarned: money(a.gross), overtime: money(a.overtime), dailyDeductions: money(a.deductions), transactionDeductions: money(t.deductions), rewards: money(t.rewards), totalDue: money(totalDue), paid: money(t.payments), remaining: money(totalDue - t.payments), presentDays: a.presentDays, absentDays: a.absentDays };
}

export async function worker(req, res, next) {
  try {
    const projectId = requireProjectId(req), project = await projectOrFail(projectId);
    const w = await Worker.findOne({ _id: req.params.workerId, projectId }).lean();
    if (!w) fail("WORKER_NOT_FOUND", "Worker not found", 404);
    const assignments = await WorkerProject.find({ projectId, workerId: w._id }).sort({ effectiveFrom: 1 }).lean();
    if (!assignments.length) fail("WORKER_NOT_IN_PROJECT", "Worker is not assigned to this project", 404);
    const txs = await Transaction.find({ projectId, workerId: w._id }).sort({ date: 1, createdAt: 1 }).lean();
    const weeks = await Week.find({ projectId, "workers.workerId": w._id }).sort({ weekStart: 1 }).lean();
    const all = workerDayRows(weeks, w._id);
    const summary = workerSummary(all, txs);
    const sheets = [
      ["ملخص العامل", [{ "المشروع": project.name, "العامل": w.name, "إجمالي المستحق": summary.totalDue, "إجمالي المدفوع": summary.paid, "المتبقي": summary.remaining, "أيام الحضور": summary.presentDays, "أيام الغياب": summary.absentDays, "الأوفر تايم": summary.overtime, "إجمالي الخصومات اليومية": summary.dailyDeductions, "خصومات العمليات": summary.transactionDeductions, "المكافآت": summary.rewards }], [18,18,18,18,18,16,16,22,20,15]],
      ["الحضور والأجور", all.map(d => ({ "التاريخ": d.date, "اسم اليوم": dayNameArabic(d.date), "بداية الأسبوع": d.weekStart, "نهاية الأسبوع": d.weekEnd, "الحالة": d.attended ? "حاضر" : "غائب", "اليومية": money(d.wage), "خصم اليوم": money(d.deductionAmount), "الأوفر تايم": money(d.overtimeAmount), "صافي اليوم": money(d.attended ? Number(d.wage || 0) - Number(d.deductionAmount || 0) : 0) })), [14,14,14,14,14,14,14,16]],
      ["العمليات", txs.map(t => ({ "التاريخ": t.date, "النوع": t.type === "payment" ? "دفعة" : t.type === "reward" ? "مكافأة" : "خصم", "المبلغ": money(t.amount), "البيان": t.note || "" })), [14,14,14,30]],
      ["تاريخ اليومية", assignments.flatMap(a => a.wageHistory.map(x => ({ "تاريخ السريان": x.effectiveFrom, "اليومية": money(x.amount), "البيان": "تغيير اليومية" }))).sort((a,b) => a["تاريخ السريان"].localeCompare(b["تاريخ السريان"])), [18,16,25]]
    ];
    sendWorkbook(res, makeWorkbook(sheets), `${project.name}-${w.name}-تقرير-العامل.xlsx`);
  } catch (e) { next(e); }
}

export async function week(req, res, next) {
  try {
    const projectId = requireProjectId(req), project = await projectOrFail(projectId), target = String(req.query.date || "");
    if (!date(target)) fail("INVALID_DATE", "A valid date is required");
    if (isFuture(target)) fail("FUTURE_DATE_NOT_ALLOWED", "Future dates cannot be searched");
    const r = range(target), w = await Week.findOne({ projectId, weekStart: r.weekStart }).lean();
    if (!w) fail("WEEK_NOT_FOUND", "Week is not available in database", 404);
    const ids = w.workers.filter(e => !e.deleted).map(e => e.workerId), workers = await Worker.find({ _id: { $in: ids } }).sort({ name: 1 }).lean();
    const txs = await Transaction.find({ projectId, date: { $gte: w.weekStart, $lte: w.weekEnd } }).lean();
    const rows = workers.map(worker => { const e = w.workers.find(x => x.workerId.toString() === worker._id.toString()); const a = calc(e?.days || []); const t = transactionTotals(txs.filter(x => x.workerId.toString() === worker._id.toString())); const due = a.net + a.overtime + t.rewards - t.deductions; return { "العامل": worker.name, "السبت": e?.days.find(d=>d.date===days(w.weekStart)[0])?.attended ? "حاضر" : "غائب", "الأحد": e?.days.find(d=>d.date===days(w.weekStart)[1])?.attended ? "حاضر" : "غائب", "الاثنين": e?.days.find(d=>d.date===days(w.weekStart)[2])?.attended ? "حاضر" : "غائب", "الثلاثاء": e?.days.find(d=>d.date===days(w.weekStart)[3])?.attended ? "حاضر" : "غائب", "الأربعاء": e?.days.find(d=>d.date===days(w.weekStart)[4])?.attended ? "حاضر" : "غائب", "الخميس": e?.days.find(d=>d.date===days(w.weekStart)[5])?.attended ? "حاضر" : "غائب", "الجمعة": e?.days.find(d=>d.date===days(w.weekStart)[6])?.attended ? "حاضر" : "غائب", "إجمالي الأجر": money(a.gross), "خصم الأيام": money(a.deductions), "خصومات العمليات": money(t.deductions), "المكافآت": money(t.rewards), "المستحق": money(due), "المدفوع": money(t.payments), "المتبقي": money(due - t.payments) }; });
    const detail = w.workers.filter(e=>!e.deleted).flatMap(e => e.days.map(d => ({ workerId:e.workerId.toString(), ...d }))).map(d => { const worker=workers.find(x=>x._id.toString()===d.workerId); return { "العامل":worker?.name||d.workerId, "التاريخ":d.date, "اليوم":dayNameArabic(d.date), "الحالة":d.attended?"حاضر":"غائب", "اليومية":money(d.wage), "خصم اليوم":money(d.deductionAmount), "صافي اليوم":money(d.attended?Number(d.wage||0)-Number(d.deductionAmount||0):0) }; });
    const operations = txs.map(t=>({ "التاريخ":t.date, "العامل":workers.find(x=>x._id.toString()===t.workerId.toString())?.name||"", "النوع":t.type === "payment" ? "دفعة" : t.type === "reward" ? "مكافأة" : "خصم", "المبلغ":money(t.amount), "البيان":t.note||"" }));
    sendWorkbook(res, makeWorkbook([["ملخص الأسبوع", rows, [18,12,12,12,12,12,12,16,16,18,16,16,16,16,16]],["تفاصيل الأيام",detail,[18,14,14,14,14,16,16]],["العمليات",operations,[14,18,14,14,30]]]), `${project.name}-الأسبوع-${w.weekStart}.xlsx`);
  } catch(e){next(e);}
}

export async function month(req, res, next) {
  try {
    const projectId=requireProjectId(req), project=await projectOrFail(projectId), now=new Date(), year=Number(req.query.year??now.getUTCFullYear()), month=Number(req.query.month??now.getUTCMonth()+1), mr=monthRange(year,month);
    if(!mr) fail("INVALID_MONTH","Invalid month");
    if(new Date(Date.UTC(year,month-1,1))>new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1))) fail("FUTURE_MONTH_NOT_ALLOWED","Future months cannot be searched");
    const weeks=await Week.find({projectId,weekEnd:{$gte:mr.start},weekStart:{$lt:mr.end}}).sort({weekStart:1}).lean(); if(!weeks.length) fail("MONTH_NOT_FOUND","Month is not available in database",404);
    const txs=await Transaction.find({projectId,date:{$gte:mr.start,$lt:mr.end}}).lean(); const ids=[...new Set(weeks.flatMap(w=>w.workers.filter(e=>!e.deleted).map(e=>e.workerId.toString())))]; const workers=await Worker.find({_id:{$in:ids}}).sort({name:1}).lean();
    const rows=workers.map(worker=>{const ds=weeks.flatMap(w=>{const e=w.workers.find(x=>x.workerId.toString()===worker._id.toString());return e&&!e.deleted?(e.days||[]).filter(d=>d.date>=mr.start&&d.date<mr.end):[]});const a=calc(ds),t=transactionTotals(txs.filter(x=>x.workerId.toString()===worker._id.toString())),due=a.net+a.overtime+t.rewards-t.deductions;return{"العامل":worker.name,"أيام الحضور":a.presentDays,"أيام الغياب":a.absentDays,"إجمالي الأجر":money(a.gross),"الأوفر تايم":money(a.overtime),"خصم الأيام":money(a.deductions),"خصومات العمليات":money(t.deductions),"المكافآت":money(t.rewards),"المستحق":money(due),"المدفوع":money(t.payments),"المتبقي":money(due-t.payments)};});
    const dayRows=workers.flatMap(worker=>weeks.flatMap(w=>{const e=w.workers.find(x=>x.workerId.toString()===worker._id.toString());return e&&!e.deleted?(e.days||[]).filter(d=>d.date>=mr.start&&d.date<mr.end).map(d=>({"العامل":worker.name,"التاريخ":d.date,"اليوم":dayNameArabic(d.date),"الحالة":d.attended?"حاضر":"غائب","اليومية":money(d.wage),"خصم اليوم":money(d.deductionAmount),"صافي اليوم":money(d.attended?Number(d.wage||0)-Number(d.deductionAmount||0):0)})):[]}));
    const ops=txs.map(t=>({"التاريخ":t.date,"العامل":workers.find(w=>w._id.toString()===t.workerId.toString())?.name||"","النوع":t.type==="payment"?"دفعة":t.type==="reward"?"مكافأة":"خصم","المبلغ":money(t.amount),"البيان":t.note||""}));
    sendWorkbook(res,makeWorkbook([["ملخص الشهر",rows,[18,16,16,16,16,18,16,16,16,16]],["تفاصيل الأيام",dayRows,[18,14,14,14,14,16,16]],["العمليات",ops,[14,18,14,14,30]]]),`${project.name}-${year}-${String(month).padStart(2,"0")}-تقرير-الشهر.xlsx`);
  }catch(e){next(e);}
}

export async function finances(req,res,next){
  try{const projectId=requireProjectId(req),project=await projectOrFail(projectId);const [weeks,txs,expenses,receipts]=await Promise.all([Week.find({projectId}).sort({weekStart:1}).lean(),Transaction.find({projectId}).sort({date:1}).lean(),ProjectExpense.find({projectId}).sort({date:1}).lean(),ProjectReceipt.find({projectId}).sort({date:1}).lean()]);const allDays=weeks.flatMap(w=>w.workers.filter(e=>!e.deleted).flatMap(e=>e.days));const a=calc(allDays),t=transactionTotals(txs),workerCost=a.net+a.overtime+t.rewards-t.deductions,expenseTotal=expenses.reduce((s,x)=>s+Number(x.amount||0),0),revenue=receipts.reduce((s,x)=>s+Number(x.amount||0),0),totalSpent=workerCost+expenseTotal;const summary=[{"المشروع":project.name,"إجمالي الإيرادات":money(revenue),"أجور العمال بعد الخصومات":money(workerCost),"إجمالي المصروفات الأخرى":money(expenseTotal),"إجمالي الصرف":money(totalSpent),"صافي الربح":money(revenue-totalSpent),"المدفوع للعمال":money(t.payments),"المتبقي للعمال":money(workerCost-t.payments),"الرصيد النقدي":money(revenue-t.payments-expenseTotal)}];const exp=expenses.map(x=>({"التاريخ":x.date,"التصنيف":x.category,"المبلغ":money(x.amount),"البيان":x.note||""}));const rec=receipts.map(x=>({"التاريخ":x.date,"المبلغ":money(x.amount),"البيان":x.note||""}));const workerRows=[];const ids=[...new Set(weeks.flatMap(w=>w.workers.filter(e=>!e.deleted).map(e=>e.workerId.toString())))];const workers=await Worker.find({_id:{$in:ids}}).lean();for(const w of workers){const ds=workerDayRows(weeks,w._id), tx=txs.filter(x=>x.workerId.toString()===w._id.toString()), s=workerSummary(ds,tx);workerRows.push({"العامل":w.name,"إجمالي الأجر":s.grossEarned,"خصم الأيام":s.dailyDeductions,"خصومات العمليات":s.transactionDeductions,"المكافآت":s.rewards,"المستحق":s.totalDue,"المدفوع":s.paid,"المتبقي":s.remaining});}sendWorkbook(res,makeWorkbook([["ملخص المشروع",summary,[18,20,24,24,18,18,18,18,18]],["العمال",workerRows,[18,16,16,18,16,16,16,16]],["الإيرادات",rec,[14,16,30]],["المصروفات",exp,[14,18,16,30]],["دفعات وعمليات العمال",txs.map(t=>({"التاريخ":t.date,"العامل":workers.find(w=>w._id.toString()===t.workerId.toString())?.name||"","النوع":t.type==="payment"?"دفعة":t.type==="reward"?"مكافأة":"خصم","المبلغ":money(t.amount),"البيان":t.note||""})),[14,18,14,16,30]]]),`${project.name}-الإيرادات-والمصروفات-والأرباح.xlsx`);}catch(e){next(e);}
}

export async function project(req,res,next){
  req.params.workerId = undefined;
  return finances(req,res,next);
}
