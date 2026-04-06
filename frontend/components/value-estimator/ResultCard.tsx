"use client";

import { useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { Card, CardBody } from "@/components/shared/Card";
import type { Confidence, Suggestion, HouseFeatures, FeatureContribution } from "@/lib/api/python-client";
import { ArrowRight, BarChart2, Table2 } from "lucide-react";
import Button from "@/components/shared/Button";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";

const CONFIDENCE_CONFIG: Record<Confidence, { label: string; className: string }> = {
  high:   { label: "✓ High confidence",      className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  medium: { label: "~ Moderate confidence",  className: "bg-amber-50 text-amber-700 border-amber-200"    },
  low:    { label: "⚠ Low confidence",       className: "bg-orange-50 text-orange-700 border-orange-200"  },
};

function formatFeatureValue(c: FeatureContribution): string {
  if (c.feature === "square_footage" || c.feature === "lot_size")
    return `${c.value.toLocaleString()} sq ft`;
  if (c.feature === "distance_to_city_center") return `${c.value} mi`;
  if (c.feature === "school_rating")           return `${c.value} / 10`;
  return String(c.value);
}

// ── Chart view ────────────────────────────────────────────────────────────────
function ContributionChart({ contributions }: { contributions: FeatureContribution[] }) {
  const top5 = contributions.slice(0, 5);
  const chartData = top5.map((c) => ({
    label: c.label,
    value: Math.abs(c.contribution),
    raw:   c.contribution,
  }));

  return (
    <>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 110, right: 20, top: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            tick={{ fontSize: 10 }}
          />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={110} />
          <Tooltip
            formatter={(_v, _name, entry) => [
              `${entry.payload.raw >= 0 ? "+" : ""}${formatCurrency(entry.payload.raw)}`,
              "Price contribution",
            ]}
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.raw >= 0 ? "#2563eb" : "#ef4444"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      {/* Ranked list below chart */}
      <div className="mt-4 space-y-2">
        {contributions.slice(0, 5).map((c, i) => (
          <div key={c.feature} className="flex items-center gap-3">
            <span className="w-5 h-5 rounded-full bg-slate-100 text-[10px] font-bold
                             text-slate-500 flex items-center justify-center shrink-0">
              {i + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-700">{c.label}</span>
                <span className={`text-sm font-bold tabular-nums shrink-0 ${c.contribution >= 0 ? "text-blue-600" : "text-red-500"}`}>
                  {c.contribution >= 0 ? "+" : ""}{formatCurrency(c.contribution)}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Your input:&nbsp;
                <span className="font-medium text-slate-600">{formatFeatureValue(c)}</span>
              </p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ── Table view ────────────────────────────────────────────────────────────────
function ContributionTable({ contributions, predictedPrice }: { contributions: FeatureContribution[]; predictedPrice: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" aria-label="Feature contribution breakdown">
        <caption className="sr-only">
          Each row shows how one property feature contributed to the predicted price.
        </caption>
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            {["#", "Feature", "Your Input", "Price Impact", "% of Total"].map((h) => (
              <th key={h} scope="col" className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {contributions.map((c, i) => {
            const pct = predictedPrice !== 0
              ? ((Math.abs(c.contribution) / Math.abs(predictedPrice)) * 100).toFixed(1)
              : "—";
            return (
              <tr key={c.feature} className="hover:bg-slate-50 transition-colors">
                <td className="px-3 py-2.5 text-slate-400 text-xs font-bold">{i + 1}</td>
                <td className="px-3 py-2.5 font-medium text-slate-700">{c.label}</td>
                <td className="px-3 py-2.5 text-slate-600">{formatFeatureValue(c)}</td>
                <td className={`px-3 py-2.5 font-semibold tabular-nums ${c.contribution >= 0 ? "text-blue-600" : "text-red-500"}`}>
                  {c.contribution >= 0 ? "+" : ""}{formatCurrency(c.contribution)}
                </td>
                <td className="px-3 py-2.5 text-slate-500 tabular-nums">{pct}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface Props {
  predictedPrice: number;
  confidence: Confidence;
  contributions: FeatureContribution[];
  suggestion?: Suggestion;
  onUseSuggestion?: (features: HouseFeatures) => void;
}

export default function ResultCard({
  predictedPrice,
  confidence,
  contributions,
  suggestion,
  onUseSuggestion,
}: Props) {
  const [view, setView] = useState<"chart" | "table">("chart");

  // ── Negative / unreliable prediction ────────────────────────────────────────
  if (predictedPrice <= 0 && suggestion) {
    return (
      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <span className="text-xl mt-0.5">🚫</span>
            <div>
              <p className="font-semibold text-orange-800 text-sm">Not a fit for the current market</p>
              <p className="text-xs text-orange-700 mt-0.5">
                This combination of inputs is outside what the model can reliably value.
                Here's the closest viable property profile:
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-500">Suggested Estimate</p>
              <p className="text-3xl font-bold text-emerald-600 mt-0.5">
                {formatCurrency(suggestion.suggested_price)}
              </p>
            </div>
            <span className="text-xs font-medium px-2.5 py-1 rounded-full border bg-slate-50 text-slate-600 border-slate-200">
              Adjusted inputs
            </span>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">What we adjusted</p>
            {suggestion.adjusted_fields.map(({ field, label, original, suggested }) => (
              <div key={field} className="flex items-center justify-between text-sm py-1.5 border-b border-slate-100 last:border-0">
                <span className="text-slate-600">{label}</span>
                <span className="flex items-center gap-1.5 font-medium">
                  <span className="text-slate-400 line-through text-xs">{original}</span>
                  <ArrowRight size={12} className="text-slate-400" />
                  <span className="text-slate-800">{suggested}</span>
                </span>
              </div>
            ))}
          </div>

          {onUseSuggestion && (
            <Button variant="primary" className="w-full" onClick={() => onUseSuggestion(suggestion.suggested_features)}>
              Use this estimate →
            </Button>
          )}
        </CardBody>
      </Card>
    );
  }

  // ── Normal prediction ────────────────────────────────────────────────────────
  const { label, className } = CONFIDENCE_CONFIG[confidence];

  return (
    <Card>
      <CardBody className="space-y-5">

        {/* Price + confidence */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">Estimated Price</p>
            <p className="text-4xl font-bold text-blue-600 mt-1">
              {formatCurrency(predictedPrice)}
            </p>
          </div>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full border whitespace-nowrap ${className}`}>
            {label}
          </span>
        </div>

        {/* What drove this price */}
        {contributions.length > 0 && (
          <section aria-label="What drove this estimate">
            {/* Section header + view toggle */}
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide" id="contributions-label">
                What drove this estimate
              </p>
              <div
                role="group"
                aria-label="Choose view"
                className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5"
              >
                <button
                  onClick={() => setView("chart")}
                  aria-pressed={view === "chart"}
                  aria-label="Chart view"
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    view === "chart"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <BarChart2 size={12} aria-hidden="true" /> Chart
                </button>
                <button
                  onClick={() => setView("table")}
                  aria-pressed={view === "table"}
                  aria-label="Table view"
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                    view === "table"
                      ? "bg-white text-blue-600 shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Table2 size={12} aria-hidden="true" /> Table
                </button>
              </div>
            </div>

            {view === "chart" ? (
              <ContributionChart contributions={contributions} />
            ) : (
              <ContributionTable contributions={contributions} predictedPrice={predictedPrice} />
            )}
          </section>
        )}

      </CardBody>
    </Card>
  );
}
