import mongoose from "mongoose";

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  code: { type: String, trim: true, default: "" },
  description: { type: String, trim: true, default: "" },
  status: { type: String, enum: ["active", "closed"], default: "active" },
  startedAt: { type: String, default: "" },
  endedAt: { type: String, default: null }
}, { timestamps: true });

schema.index({ name: 1 });
export default mongoose.model("Project", schema);
