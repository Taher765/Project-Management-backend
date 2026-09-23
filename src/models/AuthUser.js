import mongoose from "mongoose";

const authUserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  loginKey: { type: String, required: true, unique: true }
}, { timestamps: true });

export default mongoose.model("AuthUser", authUserSchema);
