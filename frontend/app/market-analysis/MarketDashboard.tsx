"use client";

import Link from "next/link";
import { useState } from "react";
import {
  TrendingUp, Download, DollarSign,
  BarChart2, Database, Home, ArrowUpDown, BrainCircuit, MapPin, RefreshCw,
} from "lucide-react";
import { type SegmentInsight, type ValueSpot } from "@/lib/api/java-client";
import { Card, CardHeader, CardBody } from "@/components/shared/Card";
import Spinner from "@/components/shared/Spinner";
import Button from "@/components/shared/Button";
import PropertyTableModal from "@/components/shared/PropertyTableModal";
import { formatCurrency, parseApiError } from "@/lib/utils";
import { useMarketInsights, useMarketStatistics } from "@/lib/hooks/useMarketData";
import type { InsightsResponse, MarketStatistics } from "@/lib/api/java-client";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";

// ── Dataset badge ─────────────────────────────────────────────────────────────
function DataBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide
                     text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
      <Database size={10} />
      CSV Data
    </span>
  );
}

// ── Segment bar chart ─────────────────────────────────────────────────────────
function SegmentChart({
  data,
  color,
  title,
}: {
  data: SegmentInsight[];
  color: string;
  title: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart
        data={data}
        margin={{ top: 8, right: 8, left: 8, bottom: 0 }}
        aria-label={title}
        role="img"
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} />
        <YAxis
          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
          tick={{ fontSize: 10 }}
          width={48}
        />
        <Tooltip
          formatter={(v) => [formatCurrency(Number(v)), "Avg. Price"]}
          labelFormatter={(l) => `${l}`}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Bar dataKey="averagePrice" radius={[4, 4, 0, 0]} fill={color} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Price driver horizontal bar chart ─────────────────────────────────────────
function DriverChart({ data }: { data: { name: string; value: number; raw: number; unit: string }[] }) {
  const top5 = data.slice(0, 5);
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={top5} layout="vertical" margin={{ left: 110, right: 20, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
          tick={{ fontSize: 10 }}
        />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
        <Tooltip
          formatter={(_v, _name, entry) => {
            const raw = (entry.payload as { raw: number }).raw;
            return [
              `${raw >= 0 ? "+" : ""}${formatCurrency(raw)} ${entry.payload.unit}`,
              "Value impact",
            ];
          }}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {top5.map((entry, i) => (
            <Cell key={i} fill={entry.raw >= 0 ? "#059669" : "#ef4444"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Property count horizontal bar chart ───────────────────────────────────────
function CountChart({
  data,
  color,
  title,
}: {
  data: { label: string; count: number }[];
  color: string;
  title: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={data.length * 44 + 20}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 32, top: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
        <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={110} />
        <Tooltip
          formatter={(v) => [`${v} properties`, "Count"]}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Bar dataKey="count" fill={color} radius={[0, 4, 4, 0]} aria-label={title} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Best value table ──────────────────────────────────────────────────────────
function ValueTable({
  spots,
  metric,
  metricLabel,
  metricFormat,
}: {
  spots: ValueSpot[];
  metric: keyof ValueSpot;
  metricLabel: string;
  metricFormat: (v: number) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            {["Size (sq ft)", "Beds", "School Rating", "City Distance", "Actual Price", metricLabel].map((h) => (
              <th
                key={h}
                className="px-3 py-2.5 text-left text-xs font-medium text-slate-500 uppercase tracking-wide"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {spots.map((p, i) => (
            <tr key={i} className="hover:bg-slate-50 transition-colors">
              <td className="px-3 py-2">{p.squareFootage.toLocaleString()}</td>
              <td className="px-3 py-2">{p.bedrooms}</td>
              <td className="px-3 py-2">{p.schoolRating} / 10</td>
              <td className="px-3 py-2">{p.distanceToCityCenter} mi</td>
              <td className="px-3 py-2 text-slate-700 font-medium">{formatCurrency(p.price)}</td>
              <td className="px-3 py-2 font-semibold text-emerald-600">
                {metricFormat(p[metric] as number)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────────────────
function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <Card>
      <CardBody className="space-y-3 py-5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-4 rounded bg-slate-100 animate-pulse" style={{ width: `${70 + (i % 3) * 10}%` }} />
        ))}
      </CardBody>
    </Card>
  );
}

function SkeletonChartCard() {
  return (
    <Card>
      <CardHeader>
        <div className="h-4 w-32 rounded bg-slate-100 animate-pulse" />
      </CardHeader>
      <CardBody>
        <div className="h-48 rounded bg-slate-100 animate-pulse" />
      </CardBody>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
interface Props {
  /** Server-prefetched insights — skips the first client-side fetch if provided. */
  initialInsights?: InsightsResponse | null;
  /** Server-prefetched statistics — skips the first client-side fetch if provided. */
  initialStatistics?: MarketStatistics | null;
}

export default function MarketDashboard({ initialInsights, initialStatistics }: Props = {}) {
  const { insights, loading: insightsLoading, error: insightsError, refresh } = useMarketInsights(initialInsights);
  const { statistics, loading: statsLoading } = useMarketStatistics(initialStatistics);
  const [refreshing, setRefreshing] = useState(false);
  const [showTable,   setShowTable]  = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  const loading = insightsLoading || statsLoading;

  if (loading) return (
    <div className="space-y-8" role="status" aria-live="polite" aria-label="Loading market data">
      {/* Header skeleton */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-2">
          <div className="h-7 w-56 rounded bg-slate-100 animate-pulse" />
          <div className="h-4 w-80 rounded bg-slate-100 animate-pulse" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-28 rounded-lg bg-slate-100 animate-pulse" />
          <div className="h-8 w-20 rounded-lg bg-slate-100 animate-pulse" />
        </div>
      </div>
      {/* KPI strip skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => <SkeletonCard key={i} rows={2} />)}
      </div>
      {/* Charts skeleton */}
      <div className="grid lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => <SkeletonChartCard key={i} />)}
      </div>
      {/* Table skeleton */}
      <SkeletonCard rows={5} />
    </div>
  );

  if (insightsError) return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Property Market Analysis</h1>
      <div
        role="alert"
        className="bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-700 space-y-2"
      >
        <p className="font-semibold">Service temporarily unavailable</p>
        <p>{parseApiError(insightsError)}</p>
        <p className="text-red-500">
          Please try again shortly or contact support if the issue persists.
        </p>
      </div>
    </div>
  );

  if (!insights) return null;

  const topDriver = insights.priceDrivers[0];

  const driversData = insights.priceDrivers.map((d) => ({
    name: d.label,
    value: Math.abs(d.priceChangePerUnit),
    raw:   d.priceChangePerUnit,
    unit:  d.unit,
  }));

  return (
    <>
      <div className="space-y-8">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Property Market Analysis</h1>
          <p className="text-slate-500 text-sm mt-1">
            Explore pricing trends, segment performance, and value opportunities across the market
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            loading={refreshing}
            aria-label="Refresh market data from CSV dataset"
            title="Clears the server cache and reloads insights from the CSV dataset"
          >
            <RefreshCw size={14} aria-hidden="true" className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
          <Link href="/market-analysis/analysis">
            <Button variant="secondary" size="sm" aria-label="Open What-If Analysis tool">
              <TrendingUp size={14} aria-hidden="true" /> What-If Analysis
            </Button>
          </Link>
          <Link href="/market-analysis/export">
            <Button variant="ghost" size="sm" aria-label="Export market data">
              <Download size={14} aria-hidden="true" /> Export
            </Button>
          </Link>
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        role="region"
        aria-label="Key market statistics"
      >

        {/* Dataset size — click to open property table */}
        <Card
          className="cursor-pointer hover:ring-2 hover:ring-emerald-400 hover:shadow-md transition-all"
          onClick={() => setShowTable(true)}
          role="button"
          aria-label="View full property dataset table"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setShowTable(true)}
        >
          <CardBody className="flex items-center gap-4 py-5">
            <div className="p-3 rounded-xl bg-emerald-50 shrink-0" aria-hidden="true">
              <Database size={22} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide" id="kpi-count-label">
                Properties Analysed
              </p>
              <p
                className="text-2xl font-bold text-emerald-600 mt-0.5"
                aria-labelledby="kpi-count-label"
              >
                {statistics ? statistics.totalProperties.toLocaleString() : "—"}
              </p>
              <p className="text-[11px] text-emerald-500 mt-0.5 font-medium">Click to view all ↗</p>
            </div>
          </CardBody>
        </Card>

        {/* Average price */}
        <Card>
          <CardBody className="flex items-center gap-4 py-5">
            <div className="p-3 rounded-xl bg-blue-50 shrink-0" aria-hidden="true">
              <DollarSign size={22} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide" id="kpi-avg-label">
                Average Home Price
              </p>
              <p
                className="text-2xl font-bold text-blue-600 mt-0.5"
                aria-labelledby="kpi-avg-label"
              >
                {statistics ? formatCurrency(Math.round(statistics.priceStats.average)) : "—"}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Median&nbsp;
                <span className="font-semibold text-slate-600">
                  {statistics ? formatCurrency(Math.round(statistics.priceStats.median)) : "—"}
                </span>
              </p>
            </div>
          </CardBody>
        </Card>

        {/* Price range */}
        <Card>
          <CardBody className="flex items-center gap-4 py-5">
            <div className="p-3 rounded-xl bg-purple-50 shrink-0" aria-hidden="true">
              <ArrowUpDown size={22} className="text-purple-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide" id="kpi-range-label">
                Price Range
              </p>
              <p
                className="text-lg font-bold text-purple-600 mt-0.5 leading-snug"
                aria-labelledby="kpi-range-label"
              >
                {statistics
                  ? `${formatCurrency(Math.round(statistics.priceStats.min))} – ${formatCurrency(Math.round(statistics.priceStats.max))}`
                  : "—"}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">lowest to highest in dataset</p>
            </div>
          </CardBody>
        </Card>

        {/* Avg property profile */}
        <Card>
          <CardBody className="flex items-center gap-4 py-5">
            <div className="p-3 rounded-xl bg-amber-50 shrink-0" aria-hidden="true">
              <Home size={22} className="text-amber-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide" id="kpi-profile-label">
                Avg. Property
              </p>
              <p
                className="text-base font-bold text-amber-600 mt-0.5 leading-snug"
                aria-labelledby="kpi-profile-label"
              >
                {statistics ? `${Math.round(statistics.squareFootageStats.average).toLocaleString()} sq ft` : "—"}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Built&nbsp;{statistics ? Math.round(statistics.yearBuiltStats.average) : "—"}
                &nbsp;·&nbsp;School&nbsp;
                {statistics ? statistics.schoolRatingStats.average.toFixed(1) : "—"}/10
              </p>
            </div>
          </CardBody>
        </Card>

      </div>

      {/* ── Dataset Distribution ── */}
      <section aria-labelledby="distribution-heading">
        <div className="flex items-center gap-3 mb-1">
          <h2 id="distribution-heading" className="text-lg font-semibold text-slate-900">
            How are properties distributed?
          </h2>
          <DataBadge />
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Property counts from the dataset broken down by bedroom count, school zone, and location.
        </p>
        <div className="grid lg:grid-cols-3 gap-4">

          <Card>
            <CardHeader>
              <p className="font-semibold text-slate-800 text-sm">🛏 Properties by Bedroom Count</p>
              <p className="text-xs text-slate-400 mt-0.5">Number of homes per bedroom tier</p>
            </CardHeader>
            <CardBody className="pt-0">
              <CountChart
                data={insights.byBedrooms.map((s) => ({ label: s.label, count: s.count }))}
                color="#2563eb"
                title="Property count by bedroom count"
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <p className="font-semibold text-slate-800 text-sm">🎓 Properties by School Zone</p>
              <p className="text-xs text-slate-400 mt-0.5">Number of homes per school rating tier</p>
            </CardHeader>
            <CardBody className="pt-0">
              <CountChart
                data={insights.bySchoolTier.map((s) => ({ label: s.label, count: s.count }))}
                color="#059669"
                title="Property count by school zone quality"
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <p className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                <MapPin size={13} className="text-amber-500" aria-hidden="true" /> Properties by Location
              </p>
              <p className="text-xs text-slate-400 mt-0.5">Number of homes per distance zone</p>
            </CardHeader>
            <CardBody className="pt-0">
              <CountChart
                data={insights.byLocationZone.map((s) => ({ label: s.label, count: s.count }))}
                color="#d97706"
                title="Property count by location zone"
              />
            </CardBody>
          </Card>

        </div>
      </section>

      {/* ── Segment pricing charts ── */}
      <section aria-labelledby="segments-heading">
        <div className="flex items-center gap-3 mb-1">
          <h2 id="segments-heading" className="text-lg font-semibold text-slate-900">
            How is the market segmented?
          </h2>
          <DataBadge />
        </div>
        <p className="text-sm text-slate-500 mb-4">
          See how typical asking prices shift across bedrooms, school zones, and location —
          useful for narrowing your search to the right segment.
        </p>

        {/* ── Segment filter bar ── */}

        <div className="grid lg:grid-cols-3 gap-4">

          {/* By bedroom */}
          <Card>
            <CardHeader>
              <p className="font-semibold text-slate-800 text-sm">🛏 Price by Bedroom Count</p>
              <p className="text-xs text-slate-400 mt-0.5">
                How much more does an extra bedroom cost?
              </p>
            </CardHeader>
            <CardBody className="pt-0">
              <SegmentChart
                data={insights.byBedrooms}
                color="#2563eb"
                title="Average price by bedroom count (from CSV data)"
              />
            </CardBody>
          </Card>

          {/* By school rating */}
          <Card>
            <CardHeader>
              <p className="font-semibold text-slate-800 text-sm">🎓 Price by School Zone Quality</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Is a top-rated school zone worth the premium?
              </p>
            </CardHeader>
            <CardBody className="pt-0">
              <SegmentChart
                data={insights.bySchoolTier}
                color="#059669"
                title="Average price by school zone quality (from CSV data)"
              />
            </CardBody>
          </Card>

          {/* By location zone */}
          <Card>
            <CardHeader>
              <p className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                <MapPin size={13} className="text-amber-500" aria-hidden="true" /> Price by Distance to City
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                How much does proximity to the city centre affect price?
              </p>
            </CardHeader>
            <CardBody className="pt-0">
              <SegmentChart
                data={insights.byLocationZone}
                color="#d97706"
                title="Average price by distance to city centre (from CSV data)"
              />
            </CardBody>
          </Card>

        </div>
      </section>

      {/* ── What adds value to a home ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <p className="font-semibold text-slate-800" id="drivers-heading">
              Price Correlation by Feature
            </p>
            <DataBadge />
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Price change per one-unit increase in each feature, calculated from the CSV dataset — top 5 shown
          </p>
        </CardHeader>
        <CardBody>
          <div className="grid lg:grid-cols-2 gap-6 items-center">
            <DriverChart data={driversData} />
            <ol className="space-y-3" aria-label="Top 5 price drivers">
              {driversData.slice(0, 5).map((d, i) => (
                <li key={d.name} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold
                               bg-slate-100 text-slate-500 shrink-0"
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-700">{d.name}</span>
                      <span className={`text-sm font-bold tabular-nums shrink-0 ${d.raw >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {d.raw >= 0 ? "+" : ""}{formatCurrency(d.raw)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{d.unit}</p>
                  </div>
                </li>
              ))}
            </ol>
            <Link href="/market-analysis/analysis" className="block col-span-full pt-2">
              <span className="text-xs text-emerald-600 hover:underline font-medium">
                → Simulate changes interactively with What-If Analysis
              </span>
            </Link>
          </div>
        </CardBody>
      </Card>

      {/* ── Best properties by buyer goal ── */}
      <section aria-labelledby="picks-heading">
        <div className="flex items-center gap-3 mb-1">
          <h2 id="picks-heading" className="text-lg font-semibold text-slate-900">
            Top picks by buyer priority
          </h2>
          <DataBadge />
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Whether you&apos;re maximising space for your budget or finding the best school zone,
          here are the standout property profiles in the market.
        </p>
        <div className="grid lg:grid-cols-2 gap-4">

          <Card>
            <CardHeader>
              <p className="font-semibold text-slate-800 text-sm">💰 Best Space for Your Money</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Highest square footage per dollar — ideal for buyers prioritising size
              </p>
            </CardHeader>
            <ValueTable
              spots={insights.bestByPrice}
              metric="pricePerSqFt"
              metricLabel="$/sq ft"
              metricFormat={(v) => `$${v.toFixed(0)}`}
            />
          </Card>

          <Card>
            <CardHeader>
              <p className="font-semibold text-slate-800 text-sm">🎓 Best School Zone Value</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Top school rating relative to price — ideal for families
              </p>
            </CardHeader>
            <ValueTable
              spots={insights.bestBySchool}
              metric="schoolPer100k"
              metricLabel="Rating/$100k"
              metricFormat={(v) => v.toFixed(2)}
            />
          </Card>

        </div>
      </section>

      {/* ── CTA ── */}
      <Card>
        <CardBody className="flex items-center justify-between gap-4 py-5">
          <div>
            <p className="font-semibold text-slate-800">
              Curious how changing one feature affects the price?
            </p>
            <p className="text-sm text-slate-500 mt-0.5">
              Use the interactive What-If tool — adjust size, bedrooms, school rating or location
              with a slider and see the estimated value update instantly.
            </p>
          </div>
          <Link href="/market-analysis/analysis" className="shrink-0">
            <Button variant="primary" aria-label="Open What-If analysis tool">
              <TrendingUp size={14} aria-hidden="true" /> Try What-If
            </Button>
          </Link>
        </CardBody>
      </Card>

    </div>

    {/* ── Property dataset modal ── */}
    {showTable && <PropertyTableModal onClose={() => setShowTable(false)} />}
    </>
  );
}
