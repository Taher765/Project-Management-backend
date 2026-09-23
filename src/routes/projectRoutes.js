import { Router } from "express";
import { create, list, get, update, remove, dashboard, expenses, addExpense, updateExpense, removeExpense, receipts, addReceipt, updateReceipt, removeReceipt } from "../controllers/projects.js";
const r=Router();
r.post("/",create); r.get("/",list); r.get("/:id",get); r.patch("/:id",update); r.delete("/:id",remove); r.get("/:id/dashboard",dashboard);
r.get("/:id/expenses",expenses); r.post("/:id/expenses",addExpense); r.patch("/:id/expenses/:expenseId",updateExpense); r.delete("/:id/expenses/:expenseId",removeExpense);
r.get("/:id/receipts",receipts); r.post("/:id/receipts",addReceipt); r.patch("/:id/receipts/:receiptId",updateReceipt); r.delete("/:id/receipts/:receiptId",removeReceipt);
export default r;
