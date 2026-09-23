import "dotenv/config";
import mongoose from "mongoose";
import Worker from "./models/Worker.js";
import WorkerProject from "./models/WorkerProject.js";
import Week from "./models/Week.js";
import Transaction from "./models/Transaction.js";

/*
  One-time migration for databases created with the older multi-project model.
  Old Worker documents were global and WorkerProject carried the project link.
  This script creates one Worker document per project, then rewires every
  WorkerProject, Week entry and Transaction to the new project-local Worker id.
*/
await mongoose.connect(process.env.MONGODB_URI);

const oldWorkers = await Worker.find({ $or: [{ projectId: { $exists: false } }, { projectId: null }] }).lean();
let created = 0, rewiredWeeks = 0, rewiredTransactions = 0, rewiredAssignments = 0;

for (const oldWorker of oldWorkers) {
  const assignments = await WorkerProject.find({ workerId: oldWorker._id }).sort({ effectiveFrom: 1 }).lean();
  const groups = new Map();
  for (const a of assignments) {
    const key = a.projectId.toString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }

  if (!groups.size) continue;

  for (const [projectKey, group] of groups) {
    const projectId = new mongoose.Types.ObjectId(projectKey);
    const histories = group.flatMap(a => a.wageHistory || [])
      .map(x => ({ amount: Number(x.amount), effectiveFrom: String(x.effectiveFrom) }))
      .filter(x => Number.isFinite(x.amount))
      .sort((a,b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    const uniqueHistory = [];
    for (const h of histories) {
      const last = uniqueHistory.at(-1);
      if (!last || last.effectiveFrom !== h.effectiveFrom || last.amount !== h.amount) uniqueHistory.push(h);
    }
    const latestAssignment = group.at(-1);
    const currentWage = Number(latestAssignment?.currentWage ?? oldWorker.currentWage ?? uniqueHistory.at(-1)?.amount ?? 0);

    const newWorker = await Worker.create({
      projectId,
      name: oldWorker.name,
      currentWage,
      wageHistory: uniqueHistory,
      hidden: Boolean(oldWorker.hidden)
    });
    created++;

    const oldIds = oldWorker._id;
    const newId = newWorker._id;

    await WorkerProject.updateMany({ projectId, workerId: oldIds }, { $set: { workerId: newId } });
    rewiredAssignments += group.length;

    const weeks = await Week.find({ projectId, "workers.workerId": oldIds });
    for (const week of weeks) {
      let changed = false;
      for (const entry of week.workers) {
        if (entry.workerId.toString() === oldIds.toString()) {
          entry.workerId = newId;
          changed = true;
        }
      }
      if (changed) { await week.save(); rewiredWeeks++; }
    }

    const txResult = await Transaction.updateMany({ projectId, workerId: oldIds }, { $set: { workerId: newId } });
    rewiredTransactions += txResult.modifiedCount || 0;
  }

  await Worker.deleteOne({ _id: oldWorker._id });
}

console.log(JSON.stringify({
  ok: true,
  migratedWorkers: oldWorkers.length,
  createdProjectWorkers: created,
  rewiredAssignments,
  rewiredWeeks,
  rewiredTransactions
}, null, 2));

await mongoose.disconnect();
