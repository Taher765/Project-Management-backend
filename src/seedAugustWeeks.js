import "dotenv/config";
import mongoose from "mongoose";
import Project from "./models/Project.js";
import WorkerProject from "./models/WorkerProject.js";
import Week from "./models/Week.js";
import { days, range, today } from "./utils/date.js";
import { assignmentCoversDate, wageForDate } from "./utils/weekService.js";

const MIN_DATA_DATE = "2026-08-01";
const now = today();

await mongoose.connect(process.env.MONGODB_URI);

const projects = await Project.find({}).lean();
let created = 0;
let updated = 0;

function addDays(value, n) {
  const d = new Date(`${value}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

for (const project of projects) {
  let cursor = range(MIN_DATA_DATE).weekStart;
  const lastWeekStart = range(now).weekStart;

  while (cursor <= lastWeekStart) {
    const r = range(cursor);
    let week = await Week.findOne({ projectId: project._id, weekStart: r.weekStart });
    if (!week) {
      week = new Week({ projectId: project._id, ...r, closed: false, workers: [] });
      created++;
    }

    if (!week.closed) {
      const assignments = await WorkerProject.find({ projectId: project._id }).lean();
      let changed = false;
      for (const assignment of assignments) {
        const weekDays = days(r.weekStart);
        if (!weekDays.some(d => assignmentCoversDate(assignment, d))) continue;

        let entry = week.workers.find(x => x.workerId.toString() === assignment.workerId.toString());
        if (!entry) {
          entry = { workerId: assignment.workerId, deleted: false, deletedAt: null, days: [] };
          week.workers.push(entry);
          changed = true;
        }

        for (const d of weekDays) {
          if (entry.days.some(x => x.date === d)) continue;
          const active = assignmentCoversDate(assignment, d);
          const wage = d < assignment.effectiveFrom
            ? Number(assignment.currentWage || 0)
            : (active ? wageForDate(assignment, d) : 0);
          entry.days.push({ date: d, attended: false, wage, deductionAmount: 0 });
          changed = true;
        }
      }
      if (changed) updated++;
    }

    if (week.isNew || week.modifiedPaths().length) await week.save();
    cursor = addDays(cursor, 7);
  }
}

console.log(JSON.stringify({ ok: true, from: MIN_DATA_DATE, through: now, created, updated }, null, 2));
await mongoose.disconnect();
