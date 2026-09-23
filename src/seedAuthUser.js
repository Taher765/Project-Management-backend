import "dotenv/config";
import mongoose from "mongoose";
import crypto from "crypto";
import AuthUser from "./models/AuthUser.js";

const username = String(process.env.AUTH_USERNAME || "admin").trim();
const password = String(process.env.AUTH_PASSWORD || "123456");

try {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is missing");
  await mongoose.connect(process.env.MONGODB_URI);

  const existing = await AuthUser.findOne({ username });
  if (existing) {
    console.log(`Auth user already exists: ${username}`);
  } else {
    await AuthUser.create({ username, password, loginKey: crypto.randomBytes(32).toString("hex") });
    console.log(`Created auth user: ${username}`);
  }
} catch (err) {
  console.error("Auth seed failed:", err.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
