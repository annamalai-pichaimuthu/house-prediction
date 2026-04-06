"use client";

import { useMemo, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, BrainCircuit, RotateCcw } from "lucide-react";
import type { WhatIfRequest } from "@/lib/api/java-client";
import { Card, CardHeader, CardBody } from "@/components/shared/Card";
import Spinner from "@/components/shared/Spinner";
import { formatCurrency, parseApiError } from "@/lib/utils";
import { useWhatIf, useMarketStatistics } from "@/lib/hooks/useMarketData";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";

// ── Slider config ─────────────────────────────────────────────────────────────

interface SliderDef {
  key:   keyof WhatIfRequest;
  label: string;
  unit:  string;
  step:  number;
  min:   number;
  max:   number;
}

const FEATURE_META: {
  key:       keyof WhatIfRequest;
  rangeKey:  string;
  trainKey:  string;
  label:     string;
  unit:      string;
  step:      number;
  roundFn?:  (v: number) => number;
}[] = [
  { key: "squareFootage",        rangeKey: "squareFootage",        trainKey: "square_footage",          label: "Square Footage",  unit: "sq ft", step: 100  },
  { key: "bedrooms",             rangeKey: "bedrooms",             trainKey: "bedrooms",                label: "Bedrooms",         unit: "bd",    step: 1,   roundFn: Math.round },
  { key: "bathrooms",            rangeKey: "bathrooms",            trainKey: "bathrooms",               label: "Bathrooms",        unit: "ba",    step: 0.5, roundFn: (v) => Math.round(v * 2) / 2 },
  { key: "yearBuilt",            rangeKey: "yearBuilt",            trainKey: "year_built",              label: "Year Built",       unit: "",      step: 1,   roundFn: Math.round },
  { key: "lotSize",              rangeKey: "lotSize",              trainKey: "lot_size",                label: "Lot Size",         unit: "sq ft", step: 500  },
  { key: "distanceToCityCenter", rangeKey: "distanceToCityCenter", trainKey: "distance_to_city_center", label: "Distance to City", unit: "mi",    step: 0.5  },
  { key: "schoolRating",         rangeKey: "schoolRating",         trainKey: "school_rating",           label: "School Rating",    unit: "/ 10",  step: 0.1  },
];

function buildSliderConfig(
  whatIfRanges:   Record<string, [number, number]>,
  trainingRanges: Record<string, [number, number]>,
): { sliders: SliderDef[]; defaults: WhatIfRequest } {
  const sliders: SliderDef[] = FEATURE_META.map(({ key, rangeKey, label, unit, step }) => {
    const [lo, hi] = whatIfRanges[rangeKey] ?? [0, 100];
    return { key, label, unit, step, min: lo, max: hi };
  });

  const defaults = Object.fromEntries(
    FEATURE_META.map(({ key, trainKey, roundFn }) => {
      const [lo, hi] = trainingRanges[trainKey] ?? [0, 100];
      const mid = (lo + hi) / 2;
      return [key, roundFn ? roundFn(mid) : Math.round(mid * 10) / 10];
    }),
  ) as unknown as WhatIfRequest;

  return { sliders, defaults };
}

// ── Inner component ───────────────────────────────────────────────────────────

function AnalysisContent({
  sliders,
  defaults,
  priceMin,
  priceMax,
}: {
  sliders:  SliderDef[];
  defaults: WhatIfRequest;
  priceMin: number;
  priceMax: number;
}) {
  const { values, result, loading, error, updateField } = useWhatIf(defaults);

  // Baseline prediction (captured once on mount via a ref updated after first result)
  const baselinePrice = useRef<number | null>(null);
  if (result && baselinePrice.current === null) {
    baselinePrice.current = result.predictedPrice;
  }

  // Is any slider different from its default?
  const isDirty = FEATURE_META.some(({ key }) => values[key] !== defaults[key]);

  function resetAll() {
    FEATURE_META.forEach(({ key }) => updateField(key, defaults[key]));
  }

  // Delta from baseline
  const delta = result && baselinePrice.current !== null
    ? result.predictedPrice - baselinePrice.current
    : null;

  // Sensitivity chart data
  const driversData = result
    ? Object.entries(result.sensitivityAnalysis)
        .map(([key, val]) => ({
          name:  key.replace(/([A-Z])/g, " $1").trim(),
          value: Math.abs(val.priceChangePerUnit),
          raw:   val.priceChangePerUnit,
          unit:  val.unit,
        }))
        .sort((a, b) => b.value - a.value)
    : [];

  const rangePercent =
    result && priceMax > priceMin
      ? Math.min(100, Math.max(0,
          ((result.predictedPrice - priceMin) / (priceMax - priceMin)) * 100))
      : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/market-analysis" className="text-slate-400 hover:text-slate-600">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">What-If Analysis</h1>
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide
                         text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
          <BrainCircuit size={10} /> Live Estimate
        </span>
        {loading && (
          <span className="text-sm text-slate-400 animate-pulse">Recalculating…</span>
        )}
        {isDirty && (
          <button
            onClick={resetAll}
            className="ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800
                       border border-slate-200 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 transition-colors"
          >
            <RotateCcw size={12} /> Reset to baseline
          </button>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Sliders */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-800">Adjust Property Features</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Sliders start at the model's training midpoints. Move any slider to see
              how that change shifts the estimated price from the baseline.
            </p>
          </CardHeader>
          <CardBody className="space-y-5">
            {sliders.map(({ key, label, min, max, step, unit }) => {
              const changed = values[key] !== defaults[key];
              return (
                <div key={key} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <label className={`font-medium ${changed ? "text-emerald-700" : "text-slate-700"}`}>
                      {label}
                      {changed && (
                        <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide
                                         text-emerald-600 bg-emerald-50 border border-emerald-200
                                         rounded-full px-1.5 py-0.5">
                          changed
                        </span>
                      )}
                    </label>
                    <span className={`font-semibold tabular-nums ${changed ? "text-emerald-700" : "text-slate-600"}`}>
                      {values[key]}{unit ? ` ${unit}` : ""}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={min} max={max} step={step}
                    value={values[key]}
                    onChange={(e) => updateField(key, Number(e.target.value))}
                    className={`w-full ${changed ? "accent-emerald-600" : "accent-slate-400"}`}
                  />
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{min}{unit ? ` ${unit}` : ""}</span>
                    <span className="text-slate-400">
                      baseline: <span className="font-medium text-slate-500">{defaults[key]}{unit ? ` ${unit}` : ""}</span>
                    </span>
                    <span>{max}{unit ? ` ${unit}` : ""}</span>
                  </div>
                </div>
              );
            })}
          </CardBody>
        </Card>

        {/* Results */}
        <div className="space-y-4">
          {error && (
            <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{parseApiError(error)}</p>
          )}
          {result ? (
            <>
              {/* Delta card — the key What-If output */}
              <Card>
                <CardBody className="space-y-4 py-6">
                  {/* Baseline vs current */}
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="bg-slate-50 rounded-xl p-3">
                      <p className="text-xs text-slate-500 font-medium">Baseline estimate</p>
                      <p className="text-xl font-bold text-slate-700 mt-1 tabular-nums">
                        {baselinePrice.current !== null ? formatCurrency(baselinePrice.current) : "—"}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">training midpoints</p>
                    </div>
                    <div className={`rounded-xl p-3 ${isDirty ? "bg-emerald-50" : "bg-slate-50"}`}>
                      <p className="text-xs text-slate-500 font-medium">Current estimate</p>
                      <p className={`text-xl font-bold mt-1 tabular-nums transition-all duration-300
                                     ${loading ? "opacity-40" : ""} ${isDirty ? "text-emerald-700" : "text-slate-700"}`}>
                        {formatCurrency(result.predictedPrice)}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">your adjustments</p>
                    </div>
                  </div>

                  {/* Delta highlight */}
                  {delta !== null && isDirty && (
                    <div className={`flex items-center justify-center gap-2 py-3 rounded-xl
                                     ${delta >= 0 ? "bg-emerald-50" : "bg-red-50"}`}>
                      <span className={`text-2xl font-bold tabular-nums ${delta >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {delta >= 0 ? "+" : ""}{formatCurrency(delta)}
                      </span>
                      <span className={`text-sm font-medium ${delta >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        vs baseline
                      </span>
                    </div>
                  )}

                  {!isDirty && (
                    <p className="text-center text-xs text-slate-400">
                      Move any slider to see how it changes the price from the baseline.
                    </p>
                  )}

                  {/* Market comparison */}
                  <div className="flex items-center justify-between text-sm text-slate-500 pt-1 border-t border-slate-100">
                    <span>
                      Market avg:{" "}
                      <b className="text-slate-700">{formatCurrency(result.marketComparison.averagePrice)}</b>
                    </span>
                    <span className={result.marketComparison.differenceFromAverage >= 0 ? "text-emerald-600 font-semibold" : "text-red-500 font-semibold"}>
                      {result.marketComparison.differenceFromAverage >= 0 ? "▲" : "▼"}{" "}
                      {Math.abs(result.marketComparison.percentAboveAverage).toFixed(1)}% vs avg
                    </span>
                  </div>

                  {/* Range bar */}
                  {rangePercent !== null && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-slate-400">
                        <span>{formatCurrency(Math.round(priceMin))}</span>
                        <span className="text-slate-500 font-medium">Market price range</span>
                        <span>{formatCurrency(Math.round(priceMax))}</span>
                      </div>
                      <div className="relative h-3 bg-slate-100 rounded-full">
                        <div
                          className="absolute top-0 left-0 h-3 bg-gradient-to-r from-blue-400 to-emerald-500 rounded-full transition-all duration-300"
                          style={{ width: `${rangePercent}%` }}
                        />
                        <div
                          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white border-2 border-emerald-600 rounded-full shadow-sm transition-all duration-300"
                          style={{ left: `calc(${rangePercent}% - 6px)` }}
                        />
                      </div>
                      <p className="text-xs text-center text-slate-400">
                        Sits in the{" "}
                        <span className="font-medium text-slate-600">
                          {rangePercent < 33 ? "lower third" : rangePercent < 66 ? "middle range" : "upper tier"}
                        </span>{" "}
                        of the market
                      </p>
                    </div>
                  )}
                </CardBody>
              </Card>

              {/* "To add $50K" quick reference */}
              <Card>
                <CardBody className="py-4 space-y-2">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    What would add $50K to this estimate?
                  </p>
                  {driversData
                    .filter((d) => d.raw > 0)
                    .slice(0, 3)
                    .map((d) => {
                      const unitsNeeded = 50_000 / d.raw;
                      const amount =
                        unitsNeeded < 1
                          ? unitsNeeded.toFixed(2)
                          : Math.round(unitsNeeded).toLocaleString();
                      // d.unit is e.g. "per sq ft", "per point", "per year", "per mile"
                      // strip "per " to get the noun: "sq ft", "point", "year", "mile"
                      const unitNoun = d.unit.replace(/^per\s*/i, "").trim();
                      // pluralise simple nouns
                      const unitLabel =
                        unitsNeeded !== 1 && !unitNoun.endsWith("s") && !unitNoun.includes(" ")
                          ? `${unitNoun}s`
                          : unitNoun;
                      return (
                        <div key={d.name} className="flex items-start gap-2 text-sm">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-1.5" />
                          <span className="text-slate-600">
                            Increase <b className="text-slate-800">{d.name}</b> by{" "}
                            <b className="text-slate-800">{amount} {unitLabel}</b>
                          </span>
                        </div>
                      );
                    })}
                </CardBody>
              </Card>
            </>
          ) : (
            <Card>
              <CardBody className="text-center py-16 text-slate-400">Loading…</CardBody>
            </Card>
          )}
        </div>
      </div>

      {/* Full sensitivity table */}
      {driversData.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-800">Price Sensitivity per Feature</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              How much does the model price change for every one-unit increase in each feature?
              These are the model's learned weights — they apply regardless of current slider positions.
            </p>
          </CardHeader>
          <CardBody>
            <div className="grid lg:grid-cols-2 gap-6 items-start">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={driversData} layout="vertical" margin={{ left: 100, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} />
                  <Tooltip
                    formatter={(_v, _name, entry) => {
                      const raw = (entry.payload as { raw: number }).raw;
                      return [`${raw >= 0 ? "+" : ""}${formatCurrency(raw)} ${entry.payload.unit}`, "Price impact"];
                    }}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {driversData.map((entry, i) => (
                      <Cell key={i} fill={entry.raw >= 0 ? "#059669" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* Sensitivity table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      {["#", "Feature", "Impact per unit", "Unit"].map((h) => (
                        <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {driversData.map((d, i) => (
                      <tr key={d.name} className="hover:bg-slate-50">
                        <td className="px-3 py-2.5 text-xs font-bold text-slate-400">{i + 1}</td>
                        <td className="px-3 py-2.5 font-medium text-slate-700">{d.name}</td>
                        <td className={`px-3 py-2.5 font-semibold tabular-nums ${d.raw >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {d.raw >= 0 ? "+" : ""}{formatCurrency(d.raw)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-500 text-xs">{d.unit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

// ── Page shell ────────────────────────────────────────────────────────────────

export default function AnalysisPage() {
  const { statistics, loading } = useMarketStatistics();

  const config = useMemo(() => {
    if (!statistics?.whatIfRanges || !statistics?.trainingRanges) return null;
    return buildSliderConfig(statistics.whatIfRanges, statistics.trainingRanges);
  }, [statistics]);

  if (loading || !config) return <Spinner />;

  return (
    <AnalysisContent
      sliders={config.sliders}
      defaults={config.defaults}
      priceMin={statistics!.priceStats.min}
      priceMax={statistics!.priceStats.max}
    />
  );
}