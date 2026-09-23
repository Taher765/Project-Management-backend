import { today } from "./date.js";

export function calc(days = [], { excludeFuture = true } = {}) {
  return days.reduce((sum, day) => {
    if (excludeFuture && day.date > today()) return sum;
    const wage = Number(day.wage || 0);
    const overtime = Number(day.overtimeAmount || 0);
    if (wage <= 0) return sum;
    const attended = Boolean(day.attended);
    const gross = attended ? wage : 0;
    const deduction = attended ? Math.min(Math.max(Number(day.deductionAmount || 0), 0), gross) : 0;
    sum.gross += gross;
    sum.deductions += deduction;
    sum.net += gross - deduction;
    sum.overtime += overtime;
    sum.totalEarned += gross - deduction + overtime;
    sum.presentDays += attended ? 1 : 0;
    sum.absentDays += attended ? 0 : 1;
    return sum;
  }, { gross: 0, deductions: 0, net: 0, overtime: 0, totalEarned: 0, presentDays: 0, absentDays: 0 });
}

export function transactionTotals(transactions = []) {
  return transactions.reduce((sum, t) => {
    const amount = Number(t.amount || 0);
    if (t.type === "deduction") sum.deductions += amount;
    if (t.type === "reward") sum.rewards += amount;
    if (t.type === "payment") sum.payments += amount;
    return sum;
  }, { deductions: 0, rewards: 0, payments: 0 });
}
