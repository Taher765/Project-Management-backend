import Worker from "../models/Worker.js";
import { calc } from "./calc.js";
import { days, dayNameArabic } from "./date.js";

export async function serializeHome(week) {
  const workers = await Worker.find({ _id: { $in: week.workers.map(x => x.workerId) } }).lean();
  const map = new Map(workers.map(w => [w._id.toString(), w]));
  const rows = week.workers.filter(e => !e.deleted).map(entry => {
    const worker = map.get(entry.workerId.toString());
    if (!worker) return null;
    return { worker, days: entry.days, summary: calc(entry.days) };
  }).filter(Boolean);
  const summary = rows.reduce((s, row) => {
    s.weekGross += row.summary.gross;
    s.weekDeductions += row.summary.deductions;
    s.weekNet += row.summary.net;
    s.weekOvertime += row.summary.overtime;
    s.weekTotalEarned += row.summary.totalEarned;
    s.presentDays += row.summary.presentDays;
    s.absentDays += row.summary.absentDays;
    return s;
  }, { weekGross: 0, weekDeductions: 0, weekNet: 0, weekOvertime: 0, weekTotalEarned: 0, presentDays: 0, absentDays: 0 });
  return {
    week: { id: week._id, startDate: week.weekStart, endDate: week.weekEnd, closed: week.closed, projectId: week.projectId },
    days: days(week.weekStart).map(d => ({ date: d, dayName: dayNameArabic(d) })),
    workers: rows,
    summary
  };
}
