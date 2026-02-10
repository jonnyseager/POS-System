/** Format pence as GBP currency string */
export function formatPence(pence: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

/** Format a percentage value */
export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/** Format an ISO date string for display */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Format an ISO date string with time */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Convert pounds string input to pence integer */
export function poundsToPence(pounds: string): number {
  return Math.round(parseFloat(pounds) * 100);
}

/** Convert pence integer to pounds string for form input */
export function penceToPounds(pence: number): string {
  return (pence / 100).toFixed(2);
}

/** Today's date as YYYY-MM-DD */
export function todayISO(): string {
  return new Date().toISOString().split("T")[0]!;
}

/** 30 days ago as YYYY-MM-DD */
export function thirtyDaysAgoISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().split("T")[0]!;
}
