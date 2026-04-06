"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import {
  TrendingUp, Download, DollarSign,
  BarChart2, Sparkles, ArrowUpDown, BrainCircuit, MapPin, SlidersHorizontal, X, RefreshCw,
} from "lucide-react";
import { type SegmentInsight, type ValueSpot } from "@/lib/api/java-client";
import { Card, CardHeader, CardBody } from "@/components/shared/Card";
import Spinner from "@/components/shared/Spinner";
import Button from "@/components/shared/Button";
import { formatCurrency, parseApiError } from "@/lib/utils";
import { useMarketInsights, useMarketStatistics } from "@/lib/hooks/useMarketData";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from "recharts";

// ── AI Estimate badge ─────────────────────────────────────────────────────────
function AIBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide
                     text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-0.5">
      <BrainCircuit size={10} />
      AI Estimate
    </span>
  );
}

// ── Segment bar chart ─────────────────────────────────────────────────────────
function SegmentChart({
  data,
  color,
  activeLabel,
  title,
}: {
  data: SegmentInsight[];
  color: string;
  activeLabel?: string | null;
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
          formatter={(v) => [formatCurrency(Number(v)), "Est. Price"]}
          labelFormatter={(l) => `${l}`}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Bar dataKey="averagePrice" radius={[4, 4, 0, 0]}>
          {data.map((entry) => (
            <Cell
              key={entry.label}
              fill={activeLabel && activeLabel !== entry.label ? `${color}44` : color}
            />
          ))}
        </Bar>
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
            {["Size (sq ft)", "Beds", "School Rating", "City Distance", "Est. Price", metricLabel].map((h) => (
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
export default function MarketAnalysisPage() {
  const { insights, loading: insightsLoading, error: insightsError, refresh } = useMarketInsights();
  const { statistics, loading: statsLoading } = useMarketStatistics();
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  // ── Segment filter state ───────────────────────────────────────────────────
  const [bedroomFilter,  setBedroomFilter]  = useState<string>("all");
  const [schoolFilter,   setSchoolFilter]   = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");

  const loading = insightsLoading || statsLoading;

  const anyFilterActive = bedroomFilter !== "all" || schoolFilter !== "all" || locationFilter !== "all";

  function clearFilters() {
    setBedroomFilter("all");
    setSchoolFilter("all");
    setLocationFilter("all");
  }

  // ── Derived filtered segments ──────────────────────────────────────────────
  const filteredByBedrooms = useMemo(() => {
    if (!insights) return [];
    return bedroomFilter === "all"
      ? insights.byBedrooms
      : insights.byBedrooms.filter((s) => s.label === bedroomFilter);
  }, [insights, bedroomFilter]);

  const filteredBySchool = useMemo(() => {
    if (!insights) return [];
    return schoolFilter === "all"
      ? insights.bySchoolTier
      : insights.bySchoolTier.filter((s) => s.label === schoolFilter);
  }, [insights, schoolFilter]);

  const filteredByLocation = useMemo(() => {
    if (!insights) return [];
    return locationFilter === "all"
      ? insights.byLocationZone
      : insights.byLocationZone.filter((s) => s.label === locationFilter);
  }, [insights, locationFilter]);

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
            aria-label="Refresh market data from model"
            title="Clears the server cache and fetches the latest model insights"
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
        className="grid grid-cols-1 sm:grid-cols-3 gap-4"
        role="region"
        aria-label="Key market statistics"
      >

        {/* Average price */}
        <Card>
          <CardBody className="flex items-center gap-4 py-5">
            <div className="p-3 rounded-xl bg-emerald-50 shrink-0" aria-hidden="true">
              <DollarSign size={22} className="text-emerald-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide" id="kpi-avg-label">
                Average Home Price
              </p>
              <p
                className="text-2xl font-bold text-emerald-600 mt-0.5"
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
                Market Price Range
              </p>
              <p
                className="text-lg font-bold text-purple-600 mt-0.5 leading-snug"
                aria-labelledby="kpi-range-label"
              >
                {statistics
                  ? `${formatCurrency(Math.round(statistics.priceStats.min))} – ${formatCurrency(Math.round(statistics.priceStats.max))}`
                  : "—"}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">from entry-level to premium</p>
            </div>
          </CardBody>
        </Card>

        {/* #1 value driver */}
        <Card>
          <CardBody className="flex items-center gap-4 py-5">
            <div className="p-3 rounded-xl bg-amber-50 shrink-0" aria-hidden="true">
              <Sparkles size={22} className="text-amber-500" />
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide" id="kpi-driver-label">
                Biggest Value Driver
              </p>
              <p
                className="text-base font-bold text-amber-600 mt-0.5 leading-snug"
                aria-labelledby="kpi-driver-label"
              >
                {topDriver.label}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {formatCurrency(Math.abs(topDriver.priceChangePerUnit))} per {topDriver.unit.replace("per ", "")}
              </p>
            </div>
          </CardBody>
        </Card>

      </div>

      {/* ── Segment pricing charts ── */}
      <section aria-labelledby="segments-heading">
        <div className="flex items-center gap-3 mb-1">
          <h2 id="segments-heading" className="text-lg font-semibold text-slate-900">
            How is the market segmented?
          </h2>
          <AIBadge />
        </div>
        <p className="text-sm text-slate-500 mb-4">
          See how typical asking prices shift across bedrooms, school zones, and location —
          useful for narrowing your search to the right segment.
        </p>

        {/* ── Segment filter bar ── */}
        <div
          role="group"
          aria-label="Segment filters"
          className="flex items-center gap-3 flex-wrap mb-4 p-3 bg-slate-50 border border-slate-200 rounded-xl"
        >
          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 uppercase tracking-wide shrink-0">
            <SlidersHorizontal size={13} aria-hidden="true" /> Filter segments
          </span>

          {/* Bedroom filter */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="filter-bedrooms" className="text-xs text-slate-500 shrink-0">
              Bedrooms
            </label>
            <select
              id="filter-bedrooms"
              value={bedroomFilter}
              onChange={(e) => setBedroomFilter(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white
                         focus:outline-none focus:ring-2 focus:ring-emerald-400"
              aria-label="Filter by bedroom count"
            >
              <option value="all">All</option>
              {insights.byBedrooms.map((s) => (
                <option key={s.label} value={s.label}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* School tier filter */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="filter-school" className="text-xs text-slate-500 shrink-0">
              School Zone
            </label>
            <select
              id="filter-school"
              value={schoolFilter}
              onChange={(e) => setSchoolFilter(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white
                         focus:outline-none focus:ring-2 focus:ring-emerald-400"
              aria-label="Filter by school zone quality"
            >
              <option value="all">All</option>
              {insights.bySchoolTier.map((s) => (
                <option key={s.label} value={s.label}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Location zone filter */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="filter-location" className="text-xs text-slate-500 shrink-0">
              Location Zone
            </label>
            <select
              id="filter-location"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white
                         focus:outline-none focus:ring-2 focus:ring-emerald-400"
              aria-label="Filter by location zone"
            >
              <option value="all">All</option>
              {insights.byLocationZone.map((s) => (
                <option key={s.label} value={s.label}>{s.label}</option>
              ))}
            </select>
          </div>

          {anyFilterActive && (
            <button
              onClick={clearFilters}
              className="ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-red-500
                         bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 transition-colors"
              aria-label="Clear all segment filters"
            >
              <X size={12} aria-hidden="true" /> Clear filters
            </button>
          )}
        </div>

        {/* Live region announces filter result count to screen readers */}
        <p className="sr-only" role="status" aria-live="polite">
          {anyFilterActive
            ? `Showing filtered segments: ${filteredByBedrooms.length} bedroom, ${filteredBySchool.length} school, ${filteredByLocation.length} location segments`
            : "Showing all market segments"}
        </p>

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
                activeLabel={bedroomFilter !== "all" ? bedroomFilter : null}
                title="Estimated price by bedroom count"
              />
              <div
                className="mt-3 space-y-1.5 border-t border-slate-100 pt-3"
                role="list"
                aria-label="Bedroom segment price list"
              >
                {filteredByBedrooms.map((s) => (
                  <div
                    key={s.label}
                    role="listitem"
                    className={`flex justify-between text-xs rounded px-1 py-0.5 transition-colors ${
                      bedroomFilter !== "all" && s.label === bedroomFilter
                        ? "bg-blue-50"
                        : ""
                    }`}
                  >
                    <span className="text-slate-500">{s.label}</span>
                    <span className="font-semibold text-slate-700">{formatCurrency(s.averagePrice)}</span>
                  </div>
                ))}
                {filteredByBedrooms.length === 0 && (
                  <p className="text-xs text-slate-400 italic">No segments match</p>
                )}
              </div>
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
                activeLabel={schoolFilter !== "all" ? schoolFilter : null}
                title="Estimated price by school zone quality"
              />
              <div
                className="mt-3 space-y-1.5 border-t border-slate-100 pt-3"
                role="list"
                aria-label="School zone segment price list"
              >
                {filteredBySchool.map((s) => (
                  <div
                    key={s.label}
                    role="listitem"
                    className={`flex justify-between text-xs rounded px-1 py-0.5 transition-colors ${
                      schoolFilter !== "all" && s.label === schoolFilter
                        ? "bg-emerald-50"
                        : ""
                    }`}
                  >
                    <span className="text-slate-500">{s.label}</span>
                    <span className="font-semibold text-slate-700">{formatCurrency(s.averagePrice)}</span>
                  </div>
                ))}
                {filteredBySchool.length === 0 && (
                  <p className="text-xs text-slate-400 italic">No segments match</p>
                )}
              </div>
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
                activeLabel={locationFilter !== "all" ? locationFilter : null}
                title="Estimated price by distance to city centre"
              />
              <div
                className="mt-3 space-y-1.5 border-t border-slate-100 pt-3"
                role="list"
                aria-label="Location zone segment price list"
              >
                {filteredByLocation.map((s) => (
                  <div
                    key={s.label}
                    role="listitem"
                    className={`flex justify-between text-xs rounded px-1 py-0.5 transition-colors ${
                      locationFilter !== "all" && s.label === locationFilter
                        ? "bg-amber-50"
                        : ""
                    }`}
                  >
                    <span className="text-slate-500">{s.label}</span>
                    <span className="font-semibold text-slate-700">{formatCurrency(s.averagePrice)}</span>
                  </div>
                ))}
                {filteredByLocation.length === 0 && (
                  <p className="text-xs text-slate-400 italic">No segments match</p>
                )}
              </div>
            </CardBody>
          </Card>

        </div>
      </section>

      {/* ── What adds value to a home ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <p className="font-semibold text-slate-800" id="drivers-heading">
              What adds the most value to a home?
            </p>
            <AIBadge />
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Estimated dollar impact on price per one-unit increase in each factor — top 5 shown
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
          <AIBadge />
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
  );
}
