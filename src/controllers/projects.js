import Project from "../models/Project.js";
import Worker from "../models/Worker.js";
import WorkerProject from "../models/WorkerProject.js";
import Transaction from "../models/Transaction.js";
import Week from "../models/Week.js";
import ProjectExpense from "../models/ProjectExpense.js";
import ProjectReceipt from "../models/ProjectReceipt.js";
import { calc, transactionTotals } from "../utils/calc.js";
import { today, date, range } from "../utils/date.js";

function error(code, message, statusCode = 400) { return Object.assign(new Error(message), { code, statusCode }); }
function positive(v) { return v !== undefined && v !== null && String(v).trim() !== "" && Number.isFinite(Number(v)) && Number(v) > 0; }

export async function create(req, res, next) {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) throw error("INVALID_PROJECT", "Project name is required");
    const project = await Project.create({ name, code: String(req.body.code || "").trim(), description: String(req.body.description || "").trim(), startedAt: req.body.startedAt || today() });
    res.status(201).json({ success: true, data: project });
  } catch (e) { next(e); }
}

export async function list(req, res, next) {
  try { res.json({ success: true, data: await Project.find({}).sort({ createdAt: -1 }).lean() }); }
  catch (e) { next(e); }
}

export async function get(req, res, next) {
  try {
    const project = await Project.findById(req.params.id).lean();
    if (!project) throw error("PROJECT_NOT_FOUND", "Project not found", 404);
    const assignments = await WorkerProject.find({ projectId: project._id }).lean();
    const workerIds = [...new Set(assignments.map(a => a.workerId.toString()))];
    const workers = await Worker.find({ _id: { $in: workerIds } }).sort({ name: 1 }).lean();
    res.json({ success: true, data: { project, workers, assignments } });
  } catch (e) { next(e); }
}

export async function remove(req, res, next) {
  try {
    const projectId = req.params.id;
    const project = await Project.findById(projectId).lean();
    if (!project) throw error("PROJECT_NOT_FOUND", "Project not found", 404);

    // A project is isolated: remove all of its workers, weeks, worker assignments,
    // worker transactions, expenses and receipts before removing the project itself.
    const workerIds = await WorkerProject.find({ projectId }).distinct("workerId");

    await Promise.all([
      Week.deleteMany({ projectId }),
      WorkerProject.deleteMany({ projectId }),
      Transaction.deleteMany({ projectId }),
      ProjectExpense.deleteMany({ projectId }),
      ProjectReceipt.deleteMany({ projectId }),
      Worker.deleteMany({
        $or: [
          { projectId },
          { _id: { $in: workerIds } }
        ]
      })
    ]);

    await Project.deleteOne({ _id: projectId });

    res.json({
      success: true,
      data: {
        id: projectId,
        deleted: true,
        message: "Project and all related data were deleted"
      }
    });
  } catch (e) { next(e); }
}

export async function update(req, res, next) {
  try {
    const updates = {};
    if (req.body.name !== undefined) { const name = String(req.body.name).trim(); if (!name) throw error("INVALID_PROJECT", "Project name is required"); updates.name = name; }
    if (req.body.code !== undefined) updates.code = String(req.body.code).trim();
    if (req.body.description !== undefined) updates.description = String(req.body.description).trim();
    if (req.body.status !== undefined) {
      if (!["active", "closed"].includes(req.body.status)) throw error("INVALID_STATUS", "Invalid project status");
      updates.status = req.body.status;

      // Closing records an ending date automatically unless one is supplied.
      // Re-opening clears the previous ending date unless one is explicitly supplied.
      if (req.body.endedAt === undefined) {
        updates.endedAt = req.body.status === "closed" ? today() : null;
      }
    }
    if (req.body.endedAt !== undefined) {
      const endedAt = req.body.endedAt || null;
      if (endedAt !== null && (!date(endedAt) || endedAt > today())) {
        throw error("INVALID_ENDED_AT", "Project ending date must be a valid non-future date");
      }
      updates.endedAt = endedAt;
    }
    const project = await Project.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!project) throw error("PROJECT_NOT_FOUND", "Project not found", 404);
    res.json({ success: true, data: project });
  } catch (e) { next(e); }
}

async function projectFinancial(projectId) {
  const [weeks, transactions, expenses, receipts] = await Promise.all([
    Week.find({ projectId }).lean(), Transaction.find({ projectId }).lean(), ProjectExpense.find({ projectId }).lean(), ProjectReceipt.find({ projectId }).lean()
  ]);
  const allDays = weeks.flatMap(w => w.workers.filter(e => !e.deleted).flatMap(e => e.days));
  const attendance = calc(allDays);
  const tx = transactionTotals(transactions);
  const workerCost = attendance.net + attendance.overtime + tx.rewards - tx.deductions;
  const expenseTotal = expenses.reduce((s, x) => s + Number(x.amount || 0), 0);
  const receiptsTotal = receipts.reduce((s, x) => s + Number(x.amount || 0), 0);
  const totalSpent = workerCost + expenseTotal;
  return {
    revenue: receiptsTotal,
    workerCost,
    workerGrossEarned: attendance.gross,
    overtime: attendance.overtime,
    dailyDeductions: attendance.deductions,
    transactionDeductions: tx.deductions,
    rewards: tx.rewards,
    otherExpenses: expenseTotal,
    totalSpent,
    profit: receiptsTotal - totalSpent,
    workerPaid: tx.payments,
    workerRemaining: workerCost - tx.payments,
    cashBalance: receiptsTotal - tx.payments - expenseTotal,
    presentDays: attendance.presentDays,
    absentDays: attendance.absentDays,
    weeksCount: weeks.length,
    transactionsCount: transactions.length,
    expensesCount: expenses.length,
    receiptsCount: receipts.length
  };
}

export async function dashboard(req, res, next) {
  try {
    const project = await Project.findById(req.params.id).lean();
    if (!project) throw error("PROJECT_NOT_FOUND", "Project not found", 404);
    res.json({ success: true, data: { project, financial: await projectFinancial(project._id) } });
  } catch (e) { next(e); }
}

function periodTotals(items, targetDate) {
  const target = date(targetDate);
  if (!target) throw error("INVALID_DATE", "A valid date is required");
  if (targetDate > today()) throw error("FUTURE_DATE_NOT_ALLOWED", "Future dates cannot be used");

  const week = range(targetDate);
  const monthStart = targetDate.slice(0, 8) + "01";
  const monthEnd = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);

  const total = list => list.reduce((sum, x) => sum + Number(x.amount || 0), 0);
  const inRange = (value, start, end) => value >= start && value < end;

  const dayItems = items.filter(x => x.date === targetDate);
  const weekItems = items.filter(x => x.date >= week.weekStart && x.date <= week.weekEnd);
  const monthItems = items.filter(x => inRange(x.date, monthStart, monthEnd));

  // Keep the existing overall summary unchanged and add per-category totals
  // so the frontend can render separate daily/weekly/monthly cards for each
  // expense category without making extra requests.
  const categories = [
    ["food", "أكل"],
    ["transport", "مواصلات"],
    ["materials", "خامات"],
    ["tools", "عدة"],
    ["maintenance", "صيانة"],
    ["rent", "إيجار"],
    ["utilities", "كهرباء ومياه"],
    ["other", "أخرى"]
  ].map(([category, label]) => ({
    category,
    label,
    day: { date: targetDate, total: total(dayItems.filter(x => x.category === category)) },
    week: { startDate: week.weekStart, endDate: week.weekEnd, total: total(weekItems.filter(x => x.category === category)) },
    month: { startDate: monthStart, endDate: monthEnd, total: total(monthItems.filter(x => x.category === category)) },
    total: total(items.filter(x => x.category === category))
  }));

  return {
    day: { date: targetDate, total: total(dayItems) },
    week: { startDate: week.weekStart, endDate: week.weekEnd, total: total(weekItems) },
    month: { startDate: monthStart, endDate: monthEnd, total: total(monthItems) },
    total: total(items),
    categories
  };
}

export async function expenses(req, res, next) {
  try {
    const projectId = req.params.id;
    if (!(await Project.exists({ _id: projectId }))) throw error("PROJECT_NOT_FOUND", "Project not found", 404);
    const items = await ProjectExpense.find({ projectId }).sort({ date: -1, createdAt: -1 }).lean();
    const summary = periodTotals(items, String(req.query.date || today()));
    res.json({ success: true, data: items, summary });
  } catch (e) { next(e); }
}

export async function addExpense(req, res, next) {
  try {
    const projectId = req.params.id;
    if (!(await Project.exists({ _id: projectId }))) throw error("PROJECT_NOT_FOUND", "Project not found", 404);
    const amount = Number(req.body.amount), targetDate = String(req.body.date || today());
    if (!positive(req.body.amount) || !date(targetDate) || targetDate > today()) throw error("INVALID_EXPENSE", "Positive amount and non-future valid date are required");
    const item = await ProjectExpense.create({ projectId, amount, category: req.body.category || "other", date: targetDate, note: String(req.body.note || req.body.reason || "").trim() });
    res.status(201).json({ success: true, data: item });
  } catch (e) { next(e); }
}

export async function updateExpense(req, res, next) { try { const x = await ProjectExpense.findOne({ _id: req.params.expenseId, projectId: req.params.id }); if (!x) throw error("EXPENSE_NOT_FOUND", "Expense not found", 404); if (req.body.amount !== undefined) { if (!positive(req.body.amount)) throw error("INVALID_AMOUNT", "Amount must be greater than zero"); x.amount = Number(req.body.amount); } if (req.body.category !== undefined) x.category = req.body.category; if (req.body.note !== undefined) x.note = String(req.body.note).trim(); if (req.body.date !== undefined) { if (!date(req.body.date) || req.body.date > today()) throw error("INVALID_DATE", "Invalid date"); x.date = req.body.date; } await x.save(); res.json({ success: true, data: x }); } catch(e){next(e);} }
export async function removeExpense(req, res, next) { try { const x = await ProjectExpense.findOneAndDelete({ _id: req.params.expenseId, projectId: req.params.id }); if (!x) throw error("EXPENSE_NOT_FOUND", "Expense not found", 404); res.json({ success: true, data: { id: req.params.expenseId } }); } catch(e){next(e);} }

export async function receipts(req, res, next) {
  try {
    const projectId = req.params.id;
    if (!(await Project.exists({ _id: projectId }))) throw error("PROJECT_NOT_FOUND", "Project not found", 404);
    const items = await ProjectReceipt.find({ projectId }).sort({ date: -1, createdAt: -1 }).lean();
    const summary = periodTotals(items, String(req.query.date || today()));
    res.json({ success: true, data: items, summary });
  } catch (e) { next(e); }
}
export async function addReceipt(req, res, next) { try { const projectId=req.params.id; if (!(await Project.exists({_id:projectId}))) throw error("PROJECT_NOT_FOUND","Project not found",404); const amount=Number(req.body.amount), targetDate=String(req.body.date||today()); if(!positive(req.body.amount)||!date(targetDate)||targetDate>today()) throw error("INVALID_RECEIPT","Positive amount and non-future valid date are required"); const item=await ProjectReceipt.create({projectId,amount,date:targetDate,note:String(req.body.note||req.body.reason||"").trim()}); res.status(201).json({success:true,data:item}); } catch(e){next(e);} }
export async function updateReceipt(req,res,next){try{const x=await ProjectReceipt.findOne({_id:req.params.receiptId,projectId:req.params.id});if(!x)throw error("RECEIPT_NOT_FOUND","Receipt not found",404);if(req.body.amount!==undefined){if(!positive(req.body.amount))throw error("INVALID_AMOUNT","Amount must be greater than zero");x.amount=Number(req.body.amount);}if(req.body.note!==undefined)x.note=String(req.body.note).trim();if(req.body.date!==undefined){if(!date(req.body.date)||req.body.date>today())throw error("INVALID_DATE","Invalid date");x.date=req.body.date;}await x.save();res.json({success:true,data:x});}catch(e){next(e);}}
export async function removeReceipt(req,res,next){try{const x=await ProjectReceipt.findOneAndDelete({_id:req.params.receiptId,projectId:req.params.id});if(!x)throw error("RECEIPT_NOT_FOUND","Receipt not found",404);res.json({success:true,data:{id:req.params.receiptId}});}catch(e){next(e);}}
