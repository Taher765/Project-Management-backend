import { Router } from "express";
import { create, all, list, get, monthly, update, wage, assign, endAssignment, hide, permanentDelete, attendance, hidden, restore, overtime, overtimeList } from "../controllers/workers.js";
import { add as addTransaction, list as listTransactions } from "../controllers/transactions.js";
const r=Router();
r.post("/",create);r.get("/",all);r.get("/search",list);r.get("/hidden",hidden);r.get("/:id",get);r.get("/:id/monthly",monthly);r.patch("/:id",update);r.patch("/:id/wage",wage);r.post("/:id/assignments",assign);r.patch("/:id/assignment/end",endAssignment);r.patch("/:id/restore",restore);r.delete("/:id/permanent",permanentDelete);r.delete("/:id",hide);r.patch("/:id/attendance",attendance);r.put("/:id/overtime",overtime);r.get("/:id/overtime",overtimeList);r.post("/:id/transactions",addTransaction);r.get("/:id/transactions",listTransactions);export default r;
