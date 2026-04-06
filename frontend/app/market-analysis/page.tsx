/**
 * Market Analysis — server component entry point.
 *
 * Pre-fetches market statistics and insights on the server so the page
 * hydrates instantly without a client-side loading flash.  If the Java
 * backend is unavailable at SSR time the client hooks take over gracefully.
 */
import { fetchMarketInsights, fetchMarketStatistics } from "@/lib/api/server-fetch";
import MarketDashboard from "./MarketDashboard";

export const metadata = {
  title: "Market Analysis | House Prediction",
  description:
    "Explore pricing trends, segment performance, and value opportunities across the property market.",
};

export default async function MarketAnalysisPage() {
  // Run both fetches in parallel — Next.js caches these with revalidate: 600
  const [initialStatistics, initialInsights] = await Promise.all([
    fetchMarketStatistics(),
    fetchMarketInsights(),
  ]);

  return (
    <MarketDashboard
      initialInsights={initialInsights}
      initialStatistics={initialStatistics}
    />
  );
}
