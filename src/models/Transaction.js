import mongoose from "mongoose";

const schema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
  workerId: { type: mongoose.Schema.Types.ObjectId, ref: "Worker", required: true, index: true },
  type: { type: String, enum: ["deduction", "reward", "payment"], required: true },
  amount: { type: Number, min: 0, required: true },
  note: { type: String, default: "", trim: true },
  date: { type: String, required: true, index: true }
}, { timestamps: true });

schema.index({ projectId: 1, workerId: 1, date: -1 });
export default mongoose.model("Transaction", schema);
