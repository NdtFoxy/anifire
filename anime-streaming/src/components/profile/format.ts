export function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

export function monthYear(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function fullDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Whole days between `iso` and now (0 when the date is missing/invalid). */
export function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

const UNITS: [limit: number, div: number, name: Intl.RelativeTimeFormatUnit][] = [
  [60, 1, "second"],
  [3600, 60, "minute"],
  [86_400, 3600, "hour"],
  [604_800, 86_400, "day"],
  [2_629_800, 604_800, "week"],
  [31_557_600, 2_629_800, "month"],
  [Infinity, 31_557_600, "year"],
];

const RTF = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

export function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const seconds = (t - Date.now()) / 1000;
  const abs = Math.abs(seconds);
  for (const [limit, div, unit] of UNITS) {
    if (abs < limit) return RTF.format(Math.round(seconds / div), unit);
  }
  return "";
}

/** "Today" / "Yesterday" / "12 March 2026" — the day bucket for a timestamp. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  const today = new Date();
  const startOf = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

export function clockTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}
