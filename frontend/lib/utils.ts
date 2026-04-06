import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

/**
 * API errors arrive as "503: {<RFC-9457 JSON>}".
 * Extract the human-readable `detail` field when present;
 * fall back to `title`, then to the raw string.
 */
export function parseApiError(raw: string): string {
  const jsonStart = raw.indexOf("{");
  if (jsonStart !== -1) {
    try {
      const body = JSON.parse(raw.slice(jsonStart)) as Record<string, unknown>;
      if (typeof body.detail === "string" && body.detail.length > 0) return body.detail;
      if (typeof body.title  === "string" && body.title.length  > 0) return body.title;
    } catch {
      // not JSON — fall through
    }
  }
  return raw;
}
