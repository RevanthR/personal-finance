// Short axis-tick labels (₹1.2L / ₹45k) — formatCurrency's full "₹1,23,456"
// is too wide for a Y-axis tick, this is display-only, never used for the
// real figures shown in tooltips/legends.
export function compactAxisFmt(v: number, hidden: boolean): string {
  if (hidden) return "";
  if (v === 0) return "0";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 100_000) return `${sign}${(abs / 100_000).toFixed(abs % 100_000 === 0 ? 0 : 1)}L`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(abs % 1_000 === 0 ? 0 : 1)}k`;
  return `${sign}${abs}`;
}
