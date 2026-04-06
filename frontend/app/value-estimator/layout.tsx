import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Property Value Estimator | HousingAI Portal",
  description:
    "Get an instant AI-powered estimate for any property. Enter the details and see the predicted price along with a full breakdown of what drives the value.",
};

export default function ValueEstimatorLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
