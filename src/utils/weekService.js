import Week from "../models/Week.js";
import WorkerProject from "../models/WorkerProject.js";
import Project from "../models/Project.js";
import { days, range, today, isFuture } from "./date.js";

export const MIN_DATA_DATE = "2026-08-01";

function wageForDate(workerProject, targetDate) {
  const history = [...(workerProject?.wageHistory || [])]
    .filter((x) => x.amount != null && x.effectiveFrom <= targetDate)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  return history.length
    ? Number(history.at(-1).amount)
    : Number(workerProject?.currentWage || 0);
}

function assignmentCoversDate(assignment, targetDate) {
  return (
    assignment.effectiveFrom <= targetDate &&
    (!assignment.effectiveTo || assignment.effectiveTo >= targetDate)
  );
}

export { wageForDate, assignmentCoversDate };

export async function findWeek(projectId, value) {
  const r = range(value);
  if (!r)
    throw Object.assign(new Error("Invalid date"), {
      statusCode: 400,
      code: "INVALID_DATE",
    });
  return Week.findOne({ projectId, weekStart: r.weekStart });
}

export async function requireProject(projectId) {
  const project = await Project.findById(projectId).lean();
  if (!project)
    throw Object.assign(new Error("Project not found"), {
      statusCode: 404,
      code: "PROJECT_NOT_FOUND",
    });
  return project;
}

export async function requireExistingWeek(projectId, value) {
  const project = await requireProject(projectId);
  const r = range(value);
  if (!r)
    throw Object.assign(new Error("Invalid date"), {
      statusCode: 400,
      code: "INVALID_DATE",
    });
  if (isFuture(value))
    throw Object.assign(new Error("Future weeks are not available"), {
      statusCode: 400,
      code: "FUTURE_WEEK_NOT_ALLOWED",
    });
  if (project.status === "closed" && project.endedAt) {
    const endRange = range(project.endedAt);
    if (endRange && r.weekStart > endRange.weekStart) {
      throw Object.assign(
        new Error("This project is closed at its ending week"),
        { statusCode: 409, code: "PROJECT_CLOSED" },
      );
    }
  }
  const week = await Week.findOne({ projectId, weekStart: r.weekStart });
  if (!week)
    throw Object.assign(new Error("Week is not available in database"), {
      statusCode: 404,
      code: "WEEK_NOT_FOUND",
    });
  return week;
}

export async function getWeek(projectId, value) {
  const project = await requireProject(projectId);
  const r = range(value);
  if (!r)
    throw Object.assign(new Error("Invalid date"), {
      statusCode: 400,
      code: "INVALID_DATE",
    });
  if (isFuture(value))
    throw Object.assign(new Error("Future weeks are not available"), {
      statusCode: 400,
      code: "FUTURE_WEEK_NOT_ALLOWED",
    });
  if (project.status === "closed" && project.endedAt) {
    const endRange = range(project.endedAt);
    if (endRange && r.weekStart > endRange.weekStart) {
      throw Object.assign(
        new Error("This project is closed at its ending week"),
        { statusCode: 409, code: "PROJECT_CLOSED" },
      );
    }
  }

  let week = await Week.findOne({ projectId, weekStart: r.weekStart });
  // Preserve the original behavior: the CURRENT week is created automatically.
  // Historical weeks must already exist in the database (the August seed creates them).
  if (!week) {
    const currentRange = range(today());
    if (r.weekStart !== currentRange.weekStart) {
      throw Object.assign(new Error("Week is not available in database"), {
        statusCode: 404,
        code: "WEEK_NOT_FOUND",
      });
    }
    week = await Week.create({ projectId, ...r, closed: false, workers: [] });
  }
  if (week.closed) return week;

  const assignments = await WorkerProject.find({ projectId }).lean();
  let changed = false;
  const weekDays = days(r.weekStart);

  for (const assignment of assignments) {
    const overlaps = weekDays.some((d) => assignmentCoversDate(assignment, d));
    if (!overlaps) continue;

    let entry = week.workers.find(
      (x) => x.workerId.toString() === assignment.workerId.toString(),
    );
    if (!entry) {
      entry = {
        workerId: assignment.workerId,
        deleted: false,
        deletedAt: null,
        days: [],
      };
      week.workers.push(entry);
      changed = true;
    }

    // for (const d of weekDays) {
    //   const day = entry.days.find(x => x.date === d);
    //   const active = assignmentCoversDate(assignment, d);
    //   // Requested behavior: if the worker is added on Sunday, Saturday in the
    //   // same week still carries the entered daily wage. Attendance remains false
    //   // until the user explicitly changes it. Days after assignment end stay 0.
    //   const calculatedWage = d < assignment.effectiveFrom
    //     ? Number(assignment.currentWage || 0)
    //     : (active ? wageForDate(assignment, d) : 0);
    //   if (!day) {
    //     entry.days.push({ date: d, attended: false, wage: calculatedWage, deductionAmount: 0, overtimeAmount: 0 });
    //     changed = true;
    //     continue;
    //   }
    //   // A worker can be added to an old, already-created week. Older versions
    //   // left an existing day with wage=0 because the day already existed, so
    //   // the attendance endpoint could not calculate the daily wage. Zero is
    //   // not a valid worker wage in this project; treat it as an unset wage and
    //   // fill it from the assignment. This also propagates the wage to future
    //   // existing weeks as long as the worker has not been deleted there.
    //   if (day.wage == null || !Number.isFinite(Number(day.wage)) || Number(day.wage) <= 0) {
    //     if (calculatedWage > 0) { day.wage = calculatedWage; changed = true; }
    //   }
    //   if (day.attended == null) { day.attended = false; changed = true; }
    //   if (day.deductionAmount == null || !Number.isFinite(Number(day.deductionAmount))) { day.deductionAmount = 0; changed = true; }
    //   if (day.overtimeAmount == null || !Number.isFinite(Number(day.overtimeAmount))) { day.overtimeAmount = 0; changed = true; }
    // }

    for (const d of weekDays) {
      const day = entry.days.find((x) => x.date === d);

      const calculatedWage = Number(assignment.currentWage || 0);

      if (!day) {
        entry.days.push({
          date: d,
          attended: false,
          wage: calculatedWage,
          deductionAmount: 0,
          overtimeAmount: 0,
        });

        changed = true;
        continue;
      }

      if (
        day.wage == null ||
        !Number.isFinite(Number(day.wage)) ||
        Number(day.wage) <= 0
      ) {
        if (calculatedWage > 0) {
          day.wage = calculatedWage;
          changed = true;
        }
      }

      if (day.attended == null) {
        day.attended = false;
        changed = true;
      }

      if (
        day.deductionAmount == null ||
        !Number.isFinite(Number(day.deductionAmount))
      ) {
        day.deductionAmount = 0;
        changed = true;
      }

      if (
        day.overtimeAmount == null ||
        !Number.isFinite(Number(day.overtimeAmount))
      ) {
        day.overtimeAmount = 0;
        changed = true;
      }
    }
  }

  if (changed) await week.save();
  return week;
}

export async function currentWeek(projectId) {
  const project = await requireProject(projectId);

  // Closed project: open the week containing the project's ending date.
  // Never create a new week for a closed project.
  if (project.status === "closed") {
    if (project.endedAt) return requireExistingWeek(projectId, project.endedAt);

    // Backward compatibility for closed projects that have no endedAt.
    const latest = await Week.findOne({ projectId }).sort({ weekStart: -1 });
    if (!latest) {
      throw Object.assign(
        new Error("No week is available for this closed project"),
        { statusCode: 404, code: "WEEK_NOT_FOUND" },
      );
    }
    return latest;
  }

  // Active project: use the real current week as before.
  return getWeek(projectId, today());
}

// export async function ensureWorkerInWeek(projectId, workerId, week) {
//   const assignment = await WorkerProject.findOne({ projectId, workerId }).sort({ effectiveFrom: -1 }).lean();
//   if (!assignment) return null;
//   let entry = week.workers.find(x => x.workerId.toString() === workerId.toString());
//   if (!entry) {
//     entry = { workerId, deleted: false, deletedAt: null, days: [] };
//     week.workers.push(entry);
//   }
//   entry.deleted = false;
//   entry.deletedAt = null;
//   for (const d of days(week.weekStart)) {
//     if (entry.days.some(x => x.date === d)) continue;
//     const wage = d < assignment.effectiveFrom
//       ? Number(assignment.currentWage || 0)
//       : (assignmentCoversDate(assignment, d) ? wageForDate(assignment, d) : 0);
//     entry.days.push({ date: d, attended: false, wage, deductionAmount: 0, overtimeAmount: 0 });
//   }
//   return entry;
// }
export async function ensureWorkerInWeek(projectId, workerId, week) {
  const assignment = await WorkerProject.findOne({
    projectId,
    workerId,
  })
    .sort({ effectiveFrom: -1 })
    .lean();

  if (!assignment) return null;

  let entry = week.workers.find(
    (x) => x.workerId.toString() === workerId.toString(),
  );

  if (!entry) {
    entry = {
      workerId,
      deleted: false,
      deletedAt: null,
      days: [],
    };

    week.workers.push(entry);
  }

  entry.deleted = false;
  entry.deletedAt = null;

  const wage = Number(assignment.currentWage || 0);

  for (const d of days(week.weekStart)) {
    const existingDay = entry.days.find((x) => x.date === d);

    if (existingDay) {
      // لو اليوم موجود لكن اليومية صفر، صححها
      if (
        existingDay.wage == null ||
        !Number.isFinite(Number(existingDay.wage)) ||
        Number(existingDay.wage) <= 0
      ) {
        existingDay.wage = wage;
      }

      if (existingDay.attended == null) {
        existingDay.attended = false;
      }

      if (existingDay.deductionAmount == null) {
        existingDay.deductionAmount = 0;
      }

      if (existingDay.overtimeAmount == null) {
        existingDay.overtimeAmount = 0;
      }

      continue;
    }

    entry.days.push({
      date: d,
      attended: false,
      wage,
      deductionAmount: 0,
      overtimeAmount: 0,
    });
  }

  return entry;
}
