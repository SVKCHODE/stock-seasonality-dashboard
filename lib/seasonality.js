export function monthlyReturn(startClose, endClose) {
  if (startClose == null || endClose == null || startClose === 0) return null;
  return ((endClose / startClose) - 1) * 100;
}

export function summarizeSeasonality(rows, selectedMonth, lookbackYears) {
  const cutoff = new Date().getFullYear() - lookbackYears;
  const values = rows
    .filter(r => r.month === selectedMonth && r.year > cutoff && Number.isFinite(r.returnPct))
    .map(r => r.returnPct);

  if (!values.length) return null;
  const sorted = [...values].sort((a,b) => a-b);
  const average = values.reduce((a,b) => a+b, 0) / values.length;
  const median = sorted.length % 2
    ? sorted[Math.floor(sorted.length/2)]
    : (sorted[sorted.length/2-1] + sorted[sorted.length/2]) / 2;

  return {
    average,
    median,
    positiveYears: values.filter(v => v > 0).length,
    observations: values.length,
    best: Math.max(...values),
    worst: Math.min(...values)
  };
}
