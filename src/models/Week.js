import mongoose from "mongoose";

const daySchema = new mongoose.Schema({
  date: { type: String, required: true },
  attended: { type: Boolean, default: false },
  wage: { type: Number, default: 0, min: 0 },
  deductionAmount: { type: Number, default: 0, min: 0 },
  overtimeAmount: { type: Number, default: 0, min: 0 }
}, { _id: false });

const workerWeekSchema = new mongoose.Schema({
  workerId: { type: mongoose.Schema.Types.ObjectId, required: true },
  deleted: { type: Boolean, default: false },
  deletedAt: { type: String, default: null },
  days: { type: [daySchema], default: [] }
}, { _id: false });

const schema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
  weekStart: { type: String, required: true },
  weekEnd: { type: String, required: true },
  closed: { type: Boolean, default: false },
  workers: { type: [workerWeekSchema], default: [] }
}, { timestamps: true });

schema.index({ projectId: 1, weekStart: 1 }, { unique: true });
export default mongoose.model("Week", schema);
