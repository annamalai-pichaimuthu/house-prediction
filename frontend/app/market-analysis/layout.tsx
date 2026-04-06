import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Market Analysis | HousingAI Portal",
  description:
    "Explore property pricing trends, segment performance, and value opportunities across the market.",
};

export default function MarketAnalysisLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
