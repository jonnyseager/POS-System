const gbpFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
});

export function formatPence(pence: number): string {
  return gbpFormatter.format(pence / 100);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateTime(iso: string): string {
  return `${formatDate(iso)} ${formatTime(iso)}`;
}

export function formatOrderNumber(num: number, prefix?: string): string {
  const padded = String(num).padStart(3, "0");
  return prefix ? `${prefix}-${padded}` : `#${padded}`;
}

export function poundsToPence(pounds: string): number {
  const parsed = parseFloat(pounds);
  if (isNaN(parsed)) return 0;
  return Math.round(parsed * 100);
}

export function penceToPounds(pence: number): string {
  return (pence / 100).toFixed(2);
}
