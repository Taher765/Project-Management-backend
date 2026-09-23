import Worker from "../models/Worker.js";
import WorkerProject from "../models/WorkerProject.js";
import Transaction from "../models/Transaction.js";
import Week from "../models/Week.js";
import { calc, transactionTotals } from "../utils/calc.js";
import {
  monthRange,
  today,
  date,
  isFuture,
  range,
  days,
  dayNameArabic,
} from "../utils/date.js";
import { requireProjectId } from "../utils/project.js";
import {
  currentWeek,
  getWeek,
  requireExistingWeek,
  ensureWorkerInWeek,
  wageForDate,
} from "../utils/weekService.js";

function error(code, message, statusCode = 400) {
  return Object.assign(new Error(message), { code, statusCode });
}
function positive(v) {
  return (
    v !== undefined &&
    v !== null &&
    String(v).trim() !== "" &&
    Number.isFinite(Number(v)) &&
    Number(v) > 0
  );
}

function wageTransactions(worker) {
  return (worker.wageHistory || []).map((w, i) => ({
    id: `wage-${worker._id}-${i}`,
    workerId: worker._id,
    type: "wage_change",
    amount: Number(w.amount),
    note: "تغيير اليومية",
    date: w.effectiveFrom,
    createdAt: w.effectiveFrom,
  }));
}

export async function create(req, res, next) {
  try {
    const projectId = requireProjectId(req);
    const requestedWeekId = req.body.weekId ? String(req.body.weekId) : null;
    const requestedWeekStart = req.body.weekStart
      ? String(req.body.weekStart)
      : null;
    let targetWeek = null;
    if (requestedWeekId) {
      targetWeek = await Week.findOne({ _id: requestedWeekId, projectId });
      if (!targetWeek)
        throw error(
          "WEEK_NOT_FOUND",
          "الأسبوع المطلوب غير موجود في هذا المشروع",
          404,
        );
    } else if (requestedWeekStart) {
      targetWeek = await requireExistingWeek(projectId, requestedWeekStart);
    }
    if (targetWeek?.closed)
      throw error("WEEK_CLOSED", "الأسبوع مغلق ولا يمكن تعديله", 409);

    const effectiveFrom = String(
      req.body.effectiveFrom || targetWeek?.weekStart || today(),
    );
    if (!date(effectiveFrom) || isFuture(effectiveFrom))
      throw error(
        "INVALID_DATE",
        "تاريخ الإضافة يجب أن يكون صحيحًا وغير مستقبلي",
      );

    // A Worker document belongs to ONE project only. Passing a workerId is
    // allowed only when that worker already belongs to this same project.
    if (req.body.workerId) {
      const worker = await Worker.findOne({
        _id: req.body.workerId,
        projectId,
      });
      if (!worker)
        throw error(
          "WORKER_NOT_FOUND",
          "Worker not found in this project",
          404,
        );
      const week = targetWeek || (await getWeek(projectId, effectiveFrom));
      if (week.closed)
        throw error("WEEK_CLOSED", "الأسبوع مغلق ولا يمكن تعديله", 409);
      await ensureWorkerInWeek(projectId, worker._id, week, effectiveFrom);
      await week.save();
      return res.status(200).json({
        success: true,
        message: "تمت إضافة العامل إلى الأسبوع المحدد بنجاح",
        data: worker,
      });
    }

    const name = String(req.body.name || "").trim();
    const rawWage = req.body.currentWage ?? req.body.dailyWage;
    if (!name || !positive(rawWage))
      throw error(
        "INVALID_WORKER",
        "Name and a wage greater than zero are required",
      );

    // Same name in another project is intentionally a DIFFERENT worker.
    const duplicate = await Worker.findOne({ projectId, name });
    if (duplicate)
      throw error(
        "WORKER_ALREADY_IN_PROJECT",
        "Worker is already in this project",
        409,
      );

    const currentWage = Number(rawWage);
    const worker = await Worker.create({
      projectId,
      name,
      currentWage,
      wageHistory: [{ amount: currentWage, effectiveFrom }],
      hidden: false,
    });

    await WorkerProject.create({
      projectId,
      workerId: worker._id,
      currentWage,
      wageHistory: [{ amount: currentWage, effectiveFrom }],
      effectiveFrom,
      effectiveTo: null,
    });

    const week = targetWeek || (await getWeek(projectId, effectiveFrom));
    if (!week.closed) {
      await ensureWorkerInWeek(projectId, worker._id, week, effectiveFrom);
      await week.save();
    }
    return res.status(201).json({
      success: true,
      message: "تمت إضافة العامل بنجاح إلى الأسبوع المحدد",
      data: worker,
    });
  } catch (e) {
    next(e);
  }
}

export async function all(req, res, next) {
  try {
    const projectId = requireProjectId(req);
    const workers = await Worker.find({ projectId }).sort({ name: 1 }).lean();
    const assignments = await WorkerProject.find({
      projectId,
      workerId: { $in: workers.map((w) => w._id) },
    }).lean();
    res.json({
      success: true,
      data: workers.map((w) => ({
        ...w,
        assignments: assignments.filter(
          (a) => a.workerId.toString() === w._id.toString(),
        ),
      })),
    });
  } catch (e) {
    next(e);
  }
}

export async function list(req, res, next) {
  try {
    const projectId = requireProjectId(req);
    const filter = { projectId };
    if (String(req.query.q || "").trim())
      filter.name = { $regex: String(req.query.q).trim(), $options: "i" };
    const workers = await Worker.find(filter).sort({ name: 1 }).lean();
    const week = req.query.weekStart
      ? await getWeek(projectId, req.query.weekStart)
      : await currentWeek(projectId);
    const ids = new Set(
      week.workers.filter((e) => !e.deleted).map((e) => e.workerId.toString()),
    );
    const rows = workers
      .filter((w) => ids.has(w._id.toString()))
      .map((w) => {
        const e = week.workers.find(
          (x) => x.workerId.toString() === w._id.toString() && !x.deleted,
        );
        return { worker: w, days: e?.days || [], summary: calc(e?.days || []) };
      });
    res.json({
      success: true,
      data: {
        week: {
          startDate: week.weekStart,
          endDate: week.weekEnd,
          closed: week.closed,
          projectId,
        },
        days: days(week.weekStart).map((d) => ({
          date: d,
          dayName: dayNameArabic(d),
        })),
        workers: rows,
        summary: rows.reduce(
          (s, r) => {
            s.weekGross += r.summary.gross;
            s.weekDeductions += r.summary.deductions;
            s.weekNet += r.summary.net;
            s.presentDays += r.summary.presentDays;
            s.absentDays += r.summary.absentDays;
            return s;
          },
          {
            weekGross: 0,
            weekDeductions: 0,
            weekNet: 0,
            presentDays: 0,
            absentDays: 0,
          },
        ),
      },
    });
  } catch (e) {
    next(e);
  }
}

// Keeps the old response contract used by the existing frontend:
// data.worker + transactions + financial + currentWeek + currentMonth.
export async function get(req, res, next) {
  try {
    const projectId = requireProjectId(req);
    const worker = await Worker.findOne({
      _id: req.params.id,
      projectId,
    }).lean();
    if (!worker)
      throw error("WORKER_NOT_FOUND", "Worker not found in this project", 404);

    const realTransactions = await Transaction.find({
      projectId,
      workerId: worker._id,
    })
      .sort({ date: -1, createdAt: -1 })
      .lean();
    const transactions = [
      ...realTransactions,
      ...wageTransactions(worker),
    ].sort(
      (a, b) =>
        String(b.date).localeCompare(String(a.date)) ||
        String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
    );
    const txTotals = transactionTotals(realTransactions);

    const weeks = await Week.find({ projectId, "workers.workerId": worker._id })
      .sort({ weekStart: 1 })
      .lean();
    const allDays = weeks.flatMap((w) => {
      const entry = w.workers.find(
        (x) => x.workerId.toString() === worker._id.toString(),
      );
      return entry?.days || [];
    });
    const attendance = calc(allDays);
    const totalDue =
      attendance.net +
      attendance.overtime +
      txTotals.rewards -
      txTotals.deductions;
    const financial = {
      grossEarned: attendance.gross,
      totalDailyDeductions: attendance.deductions,
      totalOvertime: attendance.overtime,
      totalTransactionDeductions: txTotals.deductions,
      totalDiscounts: attendance.deductions + txTotals.deductions,
      totalRewards: txTotals.rewards,
      totalPaid: txTotals.payments,
      totalDue,
      remaining: totalDue - txTotals.payments,
    };

    const week = await currentWeek(projectId);
    const currentEntry = week.workers.find(
      (x) => x.workerId.toString() === worker._id.toString(),
    );
    const currentWeekSummary = calc(currentEntry?.days || []);

    const now = new Date();
    const mr = monthRange(now.getUTCFullYear(), now.getUTCMonth() + 1);
    const monthDays = allDays.filter(
      (d) => d.date >= mr.start && d.date < mr.end,
    );
    const monthAttendance = calc(monthDays);
    const monthTransactions = realTransactions.filter(
      (t) => t.date >= mr.start && t.date < mr.end,
    );
    const monthTx = transactionTotals(monthTransactions);
    const monthDue =
      monthAttendance.net +
      monthAttendance.overtime +
      monthTx.rewards -
      monthTx.deductions;

    // Deliberately do not expose projectId/assignments here so the old frontend
    // can consume this response without any change.
    const responseWorker = {
      _id: worker._id,
      name: worker.name,
      currentWage: Number(worker.currentWage || 0),
      wageHistory: worker.wageHistory || [],
      hidden: Boolean(worker.hidden),
      createdAt: worker.createdAt,
      updatedAt: worker.updatedAt,
      __v: worker.__v,
    };

    res.json({
      success: true,
      data: {
        worker: responseWorker,
        transactions,
        financial,
        currentWeek: {
          startDate: week.weekStart,
          endDate: week.weekEnd,
          summary: currentWeekSummary,
        },
        currentMonth: {
          year: mr.year,
          month: mr.month,
          summary: {
            presentDays: monthAttendance.presentDays,
            absentDays: monthAttendance.absentDays,
            grossEarned: monthAttendance.gross,
            dailyDeductions: monthAttendance.deductions,
            overtime: monthAttendance.overtime,
            transactionDeductions: monthTx.deductions,
            totalDiscounts: monthAttendance.deductions + monthTx.deductions,
            rewards: monthTx.rewards,
            paid: monthTx.payments,
            totalDue: monthDue,
            remaining: monthDue - monthTx.payments,
          },
        },
      },
    });
  } catch (e) {
    next(e);
  }
}

export async function monthly(req, res, next) {
  try {
    const projectId = requireProjectId(req);
    const worker = await Worker.findOne({
      _id: req.params.id,
      projectId,
    }).lean();
    if (!worker)
      throw error("WORKER_NOT_FOUND", "Worker not found in this project", 404);

    const now = new Date();
    const requestedYear =
      req.query.year === undefined
        ? now.getUTCFullYear()
        : Number(req.query.year);
    const requestedMonth =
      req.query.month === undefined
        ? now.getUTCMonth() + 1
        : Number(req.query.month);

    if (
      !Number.isInteger(requestedYear) ||
      requestedYear < 2000 ||
      requestedYear > 9999 ||
      !Number.isInteger(requestedMonth) ||
      requestedMonth < 1 ||
      requestedMonth > 12
    ) {
      throw error("INVALID_MONTH", "A valid year and month are required");
    }

    const monthStart = `${String(requestedYear).padStart(4, "0")}-${String(requestedMonth).padStart(2, "0")}-01`;
    const nextMonth = new Date(Date.UTC(requestedYear, requestedMonth, 1));
    const monthEnd = nextMonth.toISOString().slice(0, 10);
    const todayDate = today();

    if (monthStart > todayDate) {
      throw error(
        "FUTURE_MONTH_NOT_ALLOWED",
        "Future months cannot be searched",
      );
    }

    const weeks = await Week.find({
      projectId,
      weekEnd: { $gte: monthStart },
      weekStart: { $lt: monthEnd },
    })
      .sort({ weekStart: 1 })
      .lean();

    const allMonthDays = weeks
      .flatMap((week) => {
        const entry = week.workers.find(
          (x) => x.workerId.toString() === worker._id.toString(),
        );
        return (entry?.days || []).filter(
          (d) => d.date >= monthStart && d.date < monthEnd,
        );
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const realTransactions = await Transaction.find({
      projectId,
      workerId: worker._id,
      date: { $gte: monthStart, $lt: monthEnd },
    })
      .sort({ date: -1, createdAt: -1 })
      .lean();

    const attendance = calc(allMonthDays);
    const tx = transactionTotals(realTransactions);
    const totalDue =
      attendance.net + attendance.overtime + tx.rewards - tx.deductions;

    const monthWageChanges = (worker.wageHistory || [])
      .filter(
        (w) => w.effectiveFrom >= monthStart && w.effectiveFrom < monthEnd,
      )
      .map((w, i) => ({
        id: `wage-${worker._id}-${requestedYear}-${requestedMonth}-${i}`,
        workerId: worker._id,
        type: "wage_change",
        amount: Number(w.amount),
        note: "تغيير اليومية",
        date: w.effectiveFrom,
        createdAt: w.effectiveFrom,
      }));

    const transactions = [...realTransactions, ...monthWageChanges].sort(
      (a, b) =>
        String(b.date).localeCompare(String(a.date)) ||
        String(b.createdAt || "").localeCompare(String(a.createdAt || "")),
    );

    const financial = {
      grossEarned: attendance.gross,
      totalDailyDeductions: attendance.deductions,
      totalOvertime: attendance.overtime,
      totalTransactionDeductions: tx.deductions,
      totalDiscounts: attendance.deductions + tx.deductions,
      totalRewards: tx.rewards,
      totalPaid: tx.payments,
      totalDue,
      remaining: totalDue - tx.payments,
    };

    res.json({
      success: true,
      data: {
        worker: {
          _id: worker._id,
          name: worker.name,
          currentWage: Number(worker.currentWage || 0),
          wageHistory: worker.wageHistory || [],
          hidden: Boolean(worker.hidden),
          createdAt: worker.createdAt,
          updatedAt: worker.updatedAt,
          __v: worker.__v,
        },
        month: {
          year: requestedYear,
          month: requestedMonth,
          startDate: monthStart,
          endDate: new Date(Date.UTC(requestedYear, requestedMonth, 0))
            .toISOString()
            .slice(0, 10),
        },
        attendance: {
          presentDays: attendance.presentDays,
          absentDays: attendance.absentDays,
          totalDays: allMonthDays.length,
          grossEarned: attendance.gross,
          dailyDeductions: attendance.deductions,
        },
        financial,
        transactions,
        days: allMonthDays.map((d) => ({
          date: d.date,
          attended: Boolean(d.attended),
          wage: Number(d.wage || 0),
          deductionAmount: Number(d.deductionAmount || 0),
          overtimeAmount: Number(d.overtimeAmount || 0),
          earned: d.attended ? Number(d.wage || 0) : 0,
          net: d.attended
            ? Math.max(Number(d.wage || 0) - Number(d.deductionAmount || 0), 0)
            : 0,
        })),
      },
    });
  } catch (e) {
    next(e);
  }
}

export async function update(req, res, next) {
  try {
    const projectId = requireProjectId(req);
    const worker = await Worker.findOne({ _id: req.params.id, projectId });
    if (!worker)
      throw error("WORKER_NOT_FOUND", "Worker not found in this project", 404);
    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim();
      if (!name) throw error("INVALID_NAME", "Name is required");
      const duplicate = await Worker.findOne({
        projectId,
        name,
        _id: { $ne: worker._id },
      });
      if (duplicate)
        throw error(
          "WORKER_ALREADY_IN_PROJECT",
          "Another worker with this name already exists in this project",
          409,
        );
      worker.name = name;
    }
    await worker.save();
    res.json({
      success: true,
      message: "تم تحديث بيانات العامل بنجاح",
      data: worker,
    });
  } catch (e) {
    next(e);
  }
}

export async function wage(req, res, next) {
  try {
    const projectId = requireProjectId(req);
    if (!positive(req.body.amount))
      throw error("INVALID_WAGE", "Wage must be greater than zero");
    const amount = Number(req.body.amount);
    const effectiveFrom = String(req.body.effectiveFrom || today());
    if (!date(effectiveFrom) || isFuture(effectiveFrom))
      throw error("INVALID_DATE", "Invalid effectiveFrom date");

    const worker = await Worker.findOne({ _id: req.params.id, projectId });
    if (!worker)
      throw error("WORKER_NOT_FOUND", "Worker not found in this project", 404);
    const assignment = await WorkerProject.findOne({
      projectId,
      workerId: worker._id,
      effectiveTo: null,
    }).sort({ effectiveFrom: -1 });
    if (!assignment)
      throw error(
        "WORKER_NOT_IN_PROJECT",
        "Worker is not assigned to this project",
        404,
      );

    const r = range(effectiveFrom);
    const affectedWeek = await Week.findOne({
      projectId,
      weekStart: r.weekStart,
    });
    if (affectedWeek?.closed) throw error("WEEK_CLOSED", "Week is closed", 409);

    worker.currentWage = amount;
    worker.wageHistory.push({ amount, effectiveFrom });
    await worker.save();
    assignment.currentWage = amount;
    assignment.wageHistory.push({ amount, effectiveFrom });
    await assignment.save();

    const weeks = await Week.find({
      projectId,
      weekEnd: { $gte: effectiveFrom },
      closed: false,
    });
    for (const week of weeks) {
      const entry = week.workers.find(
        (x) => x.workerId.toString() === worker._id.toString(),
      );
      if (!entry || entry.deleted) continue;
      let changed = false;
      for (const d of entry.days) {
        if (d.date >= effectiveFrom && !d.attended) {
          const nw = wageForDate(assignment, d.date);
          if (d.wage !== nw) {
            d.wage = nw;
            changed = true;
          }
        }
      }
      if (changed) await week.save();
    }
    res.json({
      success: true,
      message: "تم تعديل اليومية بنجاح",
      data: worker,
    });
  } catch (e) {
    next(e);
  }
}

export async function assign(req, res, next) {
  try {
    const projectId = String(req.body.projectId || requireProjectId(req));
    const worker = await Worker.findOne({ _id: req.params.id, projectId });
    if (!worker)
      throw error("WORKER_NOT_FOUND", "Worker not found in this project", 404);
    const effectiveFrom = String(req.body.effectiveFrom || today());
    if (!date(effectiveFrom) || isFuture(effectiveFrom))
      throw error("INVALID_DATE", "Invalid effectiveFrom date");
    if (!positive(req.body.currentWage ?? req.body.dailyWage))
      throw error("INVALID_WAGE", "A positive wage is required");
    const open = await WorkerProject.findOne({
      projectId,
      workerId: worker._id,
      effectiveTo: null,
    });
    if (open)
      throw error(
        "WORKER_ALREADY_IN_PROJECT",
        "Worker already has an open assignment",
        409,
      );
    const amount = Number(req.body.currentWage ?? req.body.dailyWage);
    const a = await WorkerProject.create({
      projectId,
      workerId: worker._id,
      currentWage: amount,
      wageHistory: [{ amount, effectiveFrom }],
      effectiveFrom,
      effectiveTo: req.body.effectiveTo || null,
    });
    worker.currentWage = amount;
    worker.wageHistory.push({ amount, effectiveFrom });
    await worker.save();
    res.status(201).json({
      success: true,
      message: "تم ربط العامل بالمشروع بنجاح",
      data: a,
    });
  } catch (e) {
    next(e);
  }
}

export async function endAssignment(req, res, next) {
  try {
    const projectId = requireProjectId(req);
    const effectiveTo = String(req.body.effectiveTo || today());
    if (!date(effectiveTo) || isFuture(effectiveTo))
      throw error("INVALID_DATE", "Invalid effectiveTo date");
    const worker = await Worker.findOne({ _id: req.params.id, projectId });
    if (!worker)
      throw error("WORKER_NOT_FOUND", "Worker not found in this project", 404);
    const a = await WorkerProject.findOne({
      projectId,
      workerId: worker._id,
      effectiveTo: null,
    }).sort({ effectiveFrom: -1 });
    if (!a)
      throw error("ASSIGNMENT_NOT_FOUND", "Open assignment not found", 404);
    if (effectiveTo < a.effectiveFrom)
      throw error("INVALID_DATE", "effectiveTo cannot be before effectiveFrom");
    const r = range(effectiveTo),
      week = await Week.findOne({ projectId, weekStart: r.weekStart });
    if (week?.closed) throw error("WEEK_CLOSED", "Week is closed", 409);
    a.effectiveTo = effectiveTo;
    await a.save();
    res.json({
      success: true,
      message: "تم إنهاء ارتباط العامل بالمشروع بنجاح",
      data: a,
    });
  } catch (e) {
    next(e);
  }
}

export async function hide(req, res, next) {
  try {
    const projectId = requireProjectId(req);
    const worker = await Worker.findOne({ _id: req.params.id, projectId });
    if (!worker)
      throw error("WORKER_NOT_FOUND", "Worker not found in this project", 404);
    const week = await requireExistingWeek(
      projectId,
      String(req.query.weekStart || req.body?.weekStart || today()),
    );
    if (week.closed) throw error("WEEK_CLOSED", "Week is closed", 409);
    const e = week.workers.find(
      (x) => x.workerId.toString() === worker._id.toString(),
    );
    if (!e) throw error("WORKER_NOT_IN_WEEK", "Worker not in week", 404);
    e.deleted = true;
    e.deletedAt = today();
    await week.save();
    res.json({
      success: true,
      message: "تم حذف العامل من الأسبوع المحدد بنجاح",
      data: {
        worker,
        week: { startDate: week.weekStart, endDate: week.weekEnd },
        deleted: true,
      },
    });
  } catch (e) {
    next(e);
  }
}

export async function attendance(req, res, next) {
  try {
    const projectId = requireProjectId(req);
    const workerId = req.params.id;
    const { date: targetDate, status, deductionAmount = 0 } = req.body;
    if (
      !date(targetDate) ||
      isFuture(targetDate) ||
      !["present", "absent"].includes(status)
    )
      throw error(
        "INVALID_ATTENDANCE",
        "A valid non-future date and status are required",
      );
    const worker = await Worker.findOne({ _id: workerId, projectId }).lean();
    if (!worker)
      throw error("WORKER_NOT_FOUND", "Worker not found in this project", 404);
    const week = await requireExistingWeek(projectId, targetDate);
    if (week.closed) throw error("WEEK_CLOSED", "Week is closed", 409);
    let e = week.workers.find((x) => x.workerId.toString() === workerId);
    if (!e) {
      await ensureWorkerInWeek(projectId, workerId, week, targetDate);
      e = week.workers.find((x) => x.workerId.toString() === workerId);
    }
    if (!e || e.deleted)
      throw error("WORKER_NOT_IN_WEEK", "Worker not in week", 404);
    let d = e.days.find((x) => x.date === targetDate);
    if (!d) {
      const assignment = await WorkerProject.findOne({
        projectId,
        workerId,
        effectiveTo: null,
      })
        .sort({ effectiveFrom: -1 })
        .lean();
      // d = {
      //   date: targetDate,
      //   attended: false,
      //   wage:
      //     wageForDate(assignment, targetDate) ||
      //     Number(worker.currentWage || 0),
      //   deductionAmount: 0,
      //   overtimeAmount: 0,
      // };

      d = {
        date: targetDate,
        attended: false,
        wage: Number(assignment?.currentWage || worker.currentWage || 0),
        deductionAmount: 0,
        overtimeAmount: 0,
      };
      e.days.push(d);
    }
    if (
      d.wage == null ||
      !Number.isFinite(Number(d.wage)) ||
      Number(d.wage) <= 0
    ) {
      const assignment = await WorkerProject.findOne({
        projectId,
        workerId,
        effectiveTo: null,
      })
        .sort({ effectiveFrom: -1 })
        .lean();
      const calculatedWage = Number(
        assignment?.currentWage || worker.currentWage || 0,
      );
      if (calculatedWage > 0) d.wage = calculatedWage;
    }
    const ded = Number(deductionAmount);
    if (!Number.isFinite(ded) || ded < 0)
      throw error("INVALID_DEDUCTION", "Invalid deduction");
    d.attended = status === "present";
    d.deductionAmount = d.attended ? Math.min(ded, Number(d.wage || 0)) : 0;
    await week.save();
    res.json({
      success: true,
      message: "تم تحديث الحضور والغياب بنجاح",
      data: {
        worker,
        date: targetDate,
        status: d.attended ? "present" : "absent",
        deductionAmount: d.deductionAmount,
        overtimeAmount: Number(d.overtimeAmount || 0),
        days: e.days,
        summary: calc(e.days),
      },
    });
  } catch (e) {
    next(e);
  }
}

export async function overtime(req, res, next) {
  try {
    const projectId = requireProjectId(req);
    const workerId = req.params.id;
    const targetDate = String(req.body.date || "");
    const amount = Number(req.body.amount);
    const weekId = req.body.weekId ? String(req.body.weekId) : null;
    const weekStart = req.body.weekStart ? String(req.body.weekStart) : null;

    if (
      !date(targetDate) ||
      isFuture(targetDate) ||
      !Number.isFinite(amount) ||
      amount < 0
    ) {
      throw error(
        "INVALID_OVERTIME",
        "قيمة الأوفر تايم يجب أن تكون رقمًا صحيحًا غير سالب والتاريخ صحيحًا وغير مستقبلي",
      );
    }

    const worker = await Worker.findOne({ _id: workerId, projectId }).lean();
    if (!worker)
      throw error("WORKER_NOT_FOUND", "العامل غير موجود في هذا المشروع", 404);

    let week;
    if (weekId) {
      week = await Week.findOne({ _id: weekId, projectId });
      if (!week)
        throw error(
          "WEEK_NOT_FOUND",
          "الأسبوع المطلوب غير موجود في هذا المشروع",
          404,
        );
    } else if (weekStart) {
      week = await requireExistingWeek(projectId, weekStart);
    } else {
      week = await requireExistingWeek(projectId, targetDate);
    }

    if (week.closed)
      throw error("WEEK_CLOSED", "الأسبوع مغلق ولا يمكن تعديله", 409);
    if (targetDate < week.weekStart || targetDate > week.weekEnd) {
      throw error(
        "OVERTIME_DATE_OUTSIDE_WEEK",
        "تاريخ الأوفر تايم ليس داخل الأسبوع المحدد",
      );
    }

    let entry = week.workers.find((x) => x.workerId.toString() === workerId);
    if (!entry)
      throw error(
        "WORKER_NOT_IN_WEEK",
        "العامل غير موجود في الأسبوع المحدد",
        404,
      );
    if (entry.deleted)
      throw error("WORKER_NOT_IN_WEEK", "العامل محذوف من هذا الأسبوع", 404);

    let day = entry.days.find((x) => x.date === targetDate);
    if (!day) {
      await ensureWorkerInWeek(projectId, workerId, week, targetDate);
      day = entry.days.find((x) => x.date === targetDate);
    }
    if (!day) throw error("INVALID_OVERTIME", "تعذر إنشاء يوم الأوفر تايم");

    day.overtimeAmount = amount;
    await week.save();

    res.json({
      success: true,
      message:
        amount === 0
          ? "تم إلغاء الأوفر تايم لهذا اليوم"
          : "تم حفظ الأوفر تايم بنجاح",
      data: {
        worker,
        week: {
          id: week._id,
          startDate: week.weekStart,
          endDate: week.weekEnd,
        },
        date: targetDate,
        overtimeAmount: amount,
        summary: calc(entry.days),
      },
    });
  } catch (e) {
    next(e);
  }
}

export async function overtimeList(req, res, next) {
  try {
    const projectId = requireProjectId(req);
    const workerId = req.params.id;
    const worker = await Worker.findOne({ _id: workerId, projectId }).lean();
    if (!worker)
      throw error("WORKER_NOT_FOUND", "العامل غير موجود في هذا المشروع", 404);
    const weekStart = req.query.weekStart ? String(req.query.weekStart) : null;
    const month = req.query.month ? Number(req.query.month) : null;
    const year = req.query.year ? Number(req.query.year) : null;
    const weeks = await Week.find({ projectId, "workers.workerId": workerId })
      .sort({ weekStart: 1 })
      .lean();
    const items = [];
    for (const week of weeks) {
      const entry = week.workers.find(
        (x) => x.workerId.toString() === workerId,
      );
      if (!entry) continue;
      for (const day of entry.days || []) {
        const amount = Number(day.overtimeAmount || 0);
        if (amount <= 0) continue;
        if (weekStart && week.weekStart !== weekStart) continue;
        if (
          month &&
          year &&
          !day.date.startsWith(
            `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-`,
          )
        )
          continue;
        items.push({
          weekId: week._id,
          weekStart: week.weekStart,
          weekEnd: week.weekEnd,
          date: day.date,
          amount,
        });
      }
    }
    res.json({
      success: true,
      data: { worker, items, total: items.reduce((s, x) => s + x.amount, 0) },
    });
  } catch (e) {
    next(e);
  }
}

export async function hidden(req, res, next) {
  try {
    const projectId = requireProjectId(req);
    const week = await requireExistingWeek(
      projectId,
      String(req.query.weekStart || today()),
    );
    const ids = week.workers.filter((x) => x.deleted).map((x) => x.workerId);
    const workers = await Worker.find({ projectId, _id: { $in: ids } })
      .sort({ name: 1 })
      .lean();
    res.json({
      success: true,
      data: {
        week: {
          startDate: week.weekStart,
          endDate: week.weekEnd,
          closed: week.closed,
        },
        workers,
      },
    });
  } catch (e) {
    next(e);
  }
}

export async function restore(req, res, next) {
  try {
    const projectId = requireProjectId(req);
    const worker = await Worker.findOne({ _id: req.params.id, projectId });
    if (!worker)
      throw error("WORKER_NOT_FOUND", "Worker not found in this project", 404);
    const week = await requireExistingWeek(
      projectId,
      String(req.query.weekStart || req.body?.weekStart || today()),
    );
    if (week.closed) throw error("WEEK_CLOSED", "Week is closed", 409);
    let e = week.workers.find(
      (x) => x.workerId.toString() === worker._id.toString(),
    );
    if (!e)
      e = await ensureWorkerInWeek(
        projectId,
        worker._id,
        week,
        String(
          req.query.effectiveFrom || req.body?.effectiveFrom || week.weekStart,
        ),
      );
    else {
      e.deleted = false;
      e.deletedAt = null;
    }
    await week.save();
    res.json({
      success: true,
      message: "تم استعادة العامل في الأسبوع المحدد بنجاح",
      data: {
        worker,
        week: { startDate: week.weekStart, endDate: week.weekEnd },
        restored: true,
      },
    });
  } catch (e) {
    next(e);
  }
}
