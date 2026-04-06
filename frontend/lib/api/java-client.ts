
const BASE = process.env.NEXT_PUBLIC_JAVA_API_URL ?? "http://localhost:9090";

export interface MarketStatistics {
  totalProperties: number;
  priceStats: { min: number; max: number; average: number; median: number };
  squareFootageStats: { average: number };
  yearBuiltStats:     { average: number };
  schoolRatingStats:  { average: number };
  /** [min, max] per feature — the ML model's training envelope. Used internally for synthetic inputs. */
  trainingRanges: Record<string, [number, number]>;
  /** [min, max] per feature — realistic human limits for the what-if slider UI (from application.yml). */
  whatIfRanges: Record<string, [number, number]>;
}

export interface SegmentInsight {
  label:           string;
  count:           number;
  averagePrice:    number;
  avgSqFt:         number;
  avgSchoolRating: number;
}

export interface PriceDriver {
  feature:            string;
  label:              string;
  priceChangePerUnit: number;
  unit:               string;
}

export interface ValueSpot {
  squareFootage:        number;
  bedrooms:             number;
  bathrooms:            number;
  yearBuilt:            number;
  schoolRating:         number;
  distanceToCityCenter: number;
  price:                number;
  pricePerSqFt:         number;
  schoolPer100k:        number;
}

export interface InsightsResponse {
  byBedrooms:     SegmentInsight[];
  bySchoolTier:   SegmentInsight[];
  byLocationZone: SegmentInsight[];
  priceDrivers:   PriceDriver[];
  bestByPrice:    ValueSpot[];
  bestBySchool:   ValueSpot[];
}

export interface WhatIfRequest {
  squareFootage: number;
  bedrooms: number;
  bathrooms: number;
  yearBuilt: number;
  lotSize: number;
  distanceToCityCenter: number;
  schoolRating: number;
}

export interface WhatIfResponse {
  predictedPrice: number;
  currency: string;
  inputs: WhatIfRequest;
  marketComparison: {
    averagePrice: number;
    differenceFromAverage: number;
    percentAboveAverage: number;
  };
  sensitivityAnalysis: Record<string, { priceChangePerUnit: number; unit: string }>;
}

const DEFAULT_TIMEOUT_MS = 15_000;

async function apiFetch<T>(path: string, init?: RequestInit & { signal?: AbortSignal }): Promise<T> {
  // Always enforce a 15 s ceiling so a hung backend never freezes the UI.
  // If the caller also passes a signal (e.g. AbortController from useWhatIf),
  // we race both — whichever fires first wins.
  const timeout = AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
  const signal  = init?.signal
    ? AbortSignal.any([init.signal, timeout])
    : timeout;
  const res = await fetch(`${BASE}${path}`, { ...init, signal });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`${res.status}: ${err}`);
  }
  return res.json() as Promise<T>;
}

export const javaClient = {
  getInsights(): Promise<InsightsResponse> {
    return apiFetch("/api/market/insights");
  },

  getStatistics(): Promise<MarketStatistics> {
    return apiFetch("/api/market/statistics");
  },

  whatIf(req: WhatIfRequest, signal?: AbortSignal): Promise<WhatIfResponse> {
    return apiFetch("/api/market/whatif", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal,
    });
  },

  /** Clears all server-side caches. Call after retraining the model to get fresh data immediately. */
  evictCaches(): Promise<void> {
    return apiFetch("/api/market/cache/evict", { method: "POST" });
  },

  async exportFile(type: "csv" | "pdf"): Promise<Blob> {
    const timeout = AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
    const res = await fetch(`${BASE}/api/market/export/${type}`, { signal: timeout });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`${res.status}: ${err}`);
    }
    return res.blob();
  },
};
