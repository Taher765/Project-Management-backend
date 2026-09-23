import mongoose from "mongoose";

const schema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  category: { type: String, enum: ["food", "transport", "materials", "tools", "maintenance", "rent", "utilities", "other"], default: "other" },
  date: { type: String, required: true, index: true },
  note: { type: String, default: "", trim: true }
}, { timestamps: true });

schema.index({ projectId: 1, date: -1 });
export default mongoose.model("ProjectExpense", schema);
