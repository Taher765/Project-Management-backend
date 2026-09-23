import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import requireSimpleAuth from "./middleware/requireSimpleAuth.js";
import projectRoutes from "./routes/projectRoutes.js";
import homeRoutes from "./routes/homeRoutes.js";
import workerRoutes from "./routes/workerRoutes.js";
import weekRoutes from "./routes/weekRoutes.js";
import transactionRoutes from "./routes/transactionRoutes.js";
import monthRoutes from "./routes/monthRoutes.js";
import exportRoutes from "./routes/exportRoutes.js";
import { arabicMessage } from "./utils/arabicMessages.js";
const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/auth", authRoutes);
app.get("/api/health", (_req, res) => res.json({ success: true }));
app.use(requireSimpleAuth);
app.use("/api/projects", projectRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/home", homeRoutes);
app.use("/api/workers", workerRoutes);
app.use("/api/weeks", weekRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/archive", monthRoutes);
app.use((_req, res) =>
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: arabicMessage("NOT_FOUND") },
  }),
);
app.use((err, _req, res, _next) => {
  console.error(err);
  const code = err.code || "SERVER_ERROR";
  res.status(err.statusCode || 500).json({
    success: false,
    error: { code, message: arabicMessage(code, err.message) },
  });
});
export default app;
