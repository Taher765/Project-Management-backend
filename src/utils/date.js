export function date(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const [y, m, d] = value.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, d));
  return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d ? x : null;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function isFuture(value) {
  return Boolean(date(value) && value > today());
}

// Project week: Saturday -> Friday. Friday is a normal, payable day.
export function range(value) {
  const d = date(value);
  if (!d) return null;
  const daysFromSaturday = (d.getUTCDay() + 1) % 7;
  const start = new Date(d);
  start.setUTCDate(start.getUTCDate() - daysFromSaturday);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return {
    weekStart: start.toISOString().slice(0, 10),
    weekEnd: end.toISOString().slice(0, 10)
  };
}

export function days(startDate) {
  const d = date(startDate);
  if (!d) return [];
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setUTCDate(x.getUTCDate() + i);
    return x.toISOString().slice(0, 10);
  });
}

export const DAY_NAMES_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

export function dayNameArabic(value) {
  const d = date(value);
  return d ? DAY_NAMES_AR[d.getUTCDay()] : null;
}

export function monthRange(year, month) {
  const y = Number(year), m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return null;
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  return { year: y, month: m, start, end };
}
