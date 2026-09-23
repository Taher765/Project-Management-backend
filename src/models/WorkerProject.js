import mongoose from "mongoose";

const wageSchema = new mongoose.Schema({
  amount: { type: Number, required: true, min: 0 },
  effectiveFrom: { type: String, required: true }
}, { _id: false });

const schema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
  workerId: { type: mongoose.Schema.Types.ObjectId, ref: "Worker", required: true, index: true },
  currentWage: { type: Number, required: true, min: 0 },
  wageHistory: { type: [wageSchema], default: [] },
  effectiveFrom: { type: String, required: true },
  effectiveTo: { type: String, default: null }
}, { timestamps: true });

schema.index({ projectId: 1, workerId: 1, effectiveFrom: 1 });
export default mongoose.model("WorkerProject", schema);
