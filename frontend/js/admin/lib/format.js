// Display-formatting helpers. All return user-visible strings; null / NaN /
// missing inputs render as "—" so a stale field never throws downstream.

export const fmtNum = (n) => {
  if (n == null || Number.isNaN(n)) return "—";
  if (Math.abs(n) >= 1000) return new Intl.NumberFormat("en-US").format(Math.round(n));
  if (Number.isInteger(n)) return String(n);
  return (Math.round(n * 10) / 10).toString();
};

export const fmtPct = (frac) => {
  if (frac == null || Number.isNaN(frac)) return "—";
  return `${(frac * 100).toFixed(1).replace(/\.0$/, "")}%`;
};

export const fmtDelta = (frac) => {
  if (frac == null || Number.isNaN(frac)) return "—";
  const pct = Math.round(frac * 100);
  if (pct === 0) return "0%";
  return `${pct > 0 ? "+" : ""}${pct}%`;
};

export const fmtRelative = (iso) => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diff = Date.now() - then;
  const min = 60 * 1000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return "just now";
  if (diff < hr) return `${Math.floor(diff / min)}m ago`;
  if (diff < day) return `${Math.floor(diff / hr)}h ago`;
  if (diff < 30 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export const fmtDay = (yyyymmdd) => {
  const [y, m, d] = yyyymmdd.split("-").map((s) => parseInt(s, 10));
  if (!y || !m || !d) return yyyymmdd;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export const fmtDateTime = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
};

export const truncateEmail = (email, max = 28) => {
  if (!email) return "—";
  if (email.length <= max) return email;
  const [local, domain] = email.split("@");
  if (!domain) return email.slice(0, max - 1) + "…";
  return `${local.slice(0, max - domain.length - 2)}…@${domain}`;
};
