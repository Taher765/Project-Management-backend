export function normalizeOvertime(value) {
  if (value === undefined || value === null || String(value).trim() === "") return 0;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return amount;
}
