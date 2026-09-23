import mongoose from "mongoose";

const wageSchema = new mongoose.Schema({
  amount: { type: Number, required: true, min: 0 },
  effectiveFrom: { type: String, required: true }
}, { _id: false });

const schema = new mongoose.Schema({
  // A worker belongs to exactly one project. The same person/name added to
  // another project gets a different Worker document and therefore a
  // completely independent history, wage, attendance and transactions.
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", index: true },
  name: { type: String, required: true, trim: true },
  currentWage: { type: Number, default: 0, min: 0 },
  wageHistory: { type: [wageSchema], default: [] },
  hidden: { type: Boolean, default: false }
}, { timestamps: true });

schema.index({ projectId: 1, name: 1 });
export default mongoose.model("Worker", schema);
