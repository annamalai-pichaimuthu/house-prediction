/**
 * Server-side data fetching utilities.
 *
 * These functions run exclusively on the server (RSC / Route Handlers).
 * They talk directly to the backends using internal URLs so backend ports
 * are never exposed to the browser.
 *
 * For local dev the URLs fall back to the NEXT_PUBLIC_ vars; in production
 * set the INTERNAL_ variants to internal service hostnames / Docker DNS names.
 */

import type { InsightsResponse, MarketStatistics } from "@/lib/api/java-client";

const JAVA_INTERNAL =
  process.env.JAVA_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_JAVA_API_URL ??
  "http://localhost:9090";

const SERVER_TIMEOUT_MS = 10_000;

async function serverFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(SERVER_TIMEOUT_MS),
      // Revalidate at most once every 10 minutes (matches the Caffeine cache TTL)
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

/** Pre-fetch market statistics for RSC hydration. Returns null on error so
 *  the client-side hook can take over gracefully. */
export async function fetchMarketStatistics(): Promise<MarketStatistics | null> {
  return serverFetch<MarketStatistics>(`${JAVA_INTERNAL}/api/market/statistics`);
}

/** Pre-fetch market insights for RSC hydration. Returns null on error. */
export async function fetchMarketInsights(): Promise<InsightsResponse | null> {
  return serverFetch<InsightsResponse>(`${JAVA_INTERNAL}/api/market/insights`);
}
