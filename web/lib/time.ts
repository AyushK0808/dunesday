const TZ = "Asia/Kolkata";

export function todayIST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function dayLabel(date: string, style: "short" | "long" = "short"): string {
  const d = new Date(`${date}T12:00:00+05:30`);
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TZ,
    weekday: style === "long" ? "long" : "short",
    day: "numeric",
    month: "short",
  }).format(d);
}

export function dayShort(date: string): string {
  const d = new Date(`${date}T12:00:00+05:30`);
  const wd = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, weekday: "short" }).format(d);
  return `${wd} ${Number(date.slice(8))}`;
}

export function clock(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }).format(d);
}

export function stamp(d: Date): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: TZ, day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).format(d);
}

export function ago(d: Date | undefined | null, now = Date.now()): string {
  if (!d) return "never";
  const s = Math.max(0, Math.round((now - d.getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export function daysUntil(date: string): number {
  const target = new Date(`${date}T00:00:00+05:30`).getTime();
  const today = new Date(`${todayIST()}T00:00:00+05:30`).getTime();
  return Math.round((target - today) / 86_400_000);
}
