import Link from "next/link";
import { TrendingUp, BarChart3, ArrowRight } from "lucide-react";
import { Card, CardBody } from "@/components/shared/Card";

const apps = [
  {
    href:        "/value-estimator",
    icon:        TrendingUp,
    accent:      "text-blue-600",
    bg:          "bg-blue-50",
    border:      "hover:border-blue-300",
    title:       "Property Value Estimator",
    tag:         "Instant Valuation",
    description: "Enter property details and receive an instant price estimate. Track past valuations, compare properties side-by-side, and review your history.",
    features:    ["Single & batch valuations", "Valuation history", "Side-by-side comparison"],
  },
  {
    href:        "/market-analysis",
    icon:        BarChart3,
    accent:      "text-emerald-600",
    bg:          "bg-emerald-50",
    border:      "hover:border-emerald-300",
    title:       "Property Market Analysis",
    tag:         "Market Intelligence",
    description: "Explore pricing trends across segments, understand what drives property values, and run scenario analysis. Export reports as CSV or PDF.",
    features:    ["Market statistics dashboard", "Scenario analysis", "CSV & PDF export"],
  },
];

export default function HomePage() {
  return (
    <div className="space-y-10">
      {/* Hero */}
      <div className="text-center space-y-3 py-8">
        <h1 className="text-4xl font-bold text-slate-900">HousingAI Portal</h1>
        <p className="text-slate-500 text-lg max-w-xl mx-auto">
          Two powerful tools to help you understand and navigate the residential
          property market.
        </p>
      </div>

      {/* App cards */}
      <div className="grid md:grid-cols-2 gap-6">
        {apps.map(({ href, icon: Icon, accent, bg, border, title, tag, description, features }) => (
          <Link key={href} href={href} className="group">
            <Card className={`h-full transition-all duration-200 ${border} hover:shadow-md`}>
              <CardBody className="space-y-4 p-6">
                <div className="flex items-start justify-between">
                  <div className={`p-3 rounded-xl ${bg}`}>
                    <Icon size={24} className={accent} />
                  </div>
                  <ArrowRight
                    size={18}
                    className="text-slate-300 group-hover:text-slate-500 group-hover:translate-x-1 transition-all mt-1"
                  />
                </div>

                <div>
                  <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
                  <span className={`text-xs font-medium ${accent} bg-opacity-10 mt-1 inline-block`}>
                    {tag}
                  </span>
                </div>

                <p className="text-slate-500 text-sm leading-relaxed">{description}</p>

                <ul className="space-y-1">
                  {features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-slate-600">
                      <span className={`w-1.5 h-1.5 rounded-full ${bg.replace("bg-", "bg-").replace("50", "500")}`} />
                      {f}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>

    </div>
  );
}
