"use client";

import Link from "next/link";
import { ArrowLeft, X, TrendingDown, DollarSign, GraduationCap, Award } from "lucide-react";
import { useComparisonStore } from "@/store/comparison";
import { Card, CardBody, CardHeader } from "@/components/shared/Card";
import Button from "@/components/shared/Button";
import { formatCurrency } from "@/lib/utils";
import type { Confidence, HistoryItem } from "@/lib/api/python-client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, LabelList,
} from "recharts";

const COLORS       = ["#2563eb", "#059669", "#d97706", "#dc2626"];
const COLORS_LIGHT = ["#dbeafe", "#d1fae5", "#fef3c7", "#fee2e2"];

const CONFIDENCE_BADGE: Record<Confidence, { label: string; className: string }> = {
  high:   { label: "✓ High",     className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  medium: { label: "~ Moderate", className: "bg-amber-50  text-amber-700  border-amber-200"     },
  low:    { label: "⚠ Low",      className: "bg-orange-50 text-orange-700 border-orange-200"    },
};

// ── Derived metric ────────────────────────────────────────────────────────────
function pricePerSqFt(item: HistoryItem) {
  return item.square_footage > 0 ? item.predicted_price / item.square_footage : 0;
}

// ── Horizontal price bar chart ────────────────────────────────────────────────
function PriceChart({ items }: { items: HistoryItem[] }) {
  const data = items.map((item, i) => ({
    name:  `P${i + 1}`,
    price: item.predicted_price,
  }));

  return (
    <ResponsiveContainer width="100%" height={56 * items.length + 40}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ left: 8, right: 100, top: 8, bottom: 8 }}
        aria-label="Estimated price per property"
        role="img"
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
        <XAxis
          type="number"
          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
          tick={{ fontSize: 10 }}
          domain={[0, "auto"]}
        />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fontWeight: 600 }} width={28} />
        <Tooltip
          formatter={(v) => [formatCurrency(Number(v)), "Estimated price"]}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        <Bar dataKey="price" radius={[0, 6, 6, 0]} maxBarSize={36}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i]} />
          ))}
          <LabelList
            dataKey="price"
            position="right"
            formatter={(v: unknown) => formatCurrency(Number(v))}
            style={{ fontSize: 12, fontWeight: 600, fill: "#334155" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── One row in the decision table ─────────────────────────────────────────────
// higherIsBetter=true  → highest value gets the ✓ badge
// higherIsBetter=false → lowest value gets the ✓ badge (e.g. price, distance)
function FeatureRow({
  label,
  items,
  getValue,
  format,
  higherIsBetter,
}: {
  label:          string;
  items:          HistoryItem[];
  getValue:       (item: HistoryItem) => number;
  format:         (v: number) => string;
  higherIsBetter: boolean;
}) {
  const values  = items.map(getValue);
  const best    = higherIsBetter ? Math.max(...values) : Math.min(...values);
  const worst   = higherIsBetter ? Math.min(...values) : Math.max(...values);
  const allSame = values.every((v) => v === values[0]);

  return (
    <tr className="hover:bg-slate-50 transition-colors">
      <td className="px-4 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">{label}</td>
      {items.map((item, i) => {
        const val      = getValue(item);
        const isBest   = !allSame && val === best;
        const isWorst  = !allSame && val === worst && items.length > 2;
        return (
          <td key={i} className="px-4 py-3 tabular-nums text-slate-700 text-sm">
            <span className={isBest ? "font-semibold" : ""}>{format(val)}</span>
            {isBest && (
              <span className="ml-1.5 inline-block text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-1.5 py-0.5 leading-none">
                ✓ best
              </span>
            )}
            {isWorst && (
              <span className="ml-1.5 inline-block text-[10px] bg-slate-100 text-slate-400 border border-slate-200 rounded-full px-1.5 py-0.5 leading-none">
                low
              </span>
            )}
          </td>
        );
      })}
    </tr>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ComparePage() {
  const { items, remove, clear } = useComparisonStore();

  if (items.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/value-estimator/history" className="text-slate-400 hover:text-slate-600" aria-label="Back to History">
            <ArrowLeft size={18} aria-hidden="true" />
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Compare Properties</h1>
        </div>
        <Card>
          <CardBody className="text-center py-16 text-slate-400">
            No properties added yet.{" "}
            <Link href="/value-estimator/history" className="text-blue-600 underline">
              Go to History →
            </Link>
          </CardBody>
        </Card>
      </div>
    );
  }

  // ── Derived comparisons ──────────────────────────────────────────────────
  const minPrice      = Math.min(...items.map((i) => i.predicted_price));
  const maxPrice      = Math.max(...items.map((i) => i.predicted_price));
  const cheapestIdx   = items.findIndex((i) => i.predicted_price === minPrice);
  const bestValueIdx  = items.reduce((best, item, i) =>
    pricePerSqFt(item) < pricePerSqFt(items[best]) ? i : best, 0);
  const bestSchoolIdx = items.reduce((best, item, i) =>
    item.school_rating > items[best].school_rating ? i : best, 0);
  const priceDelta = maxPrice - minPrice;

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <Link href="/value-estimator/history" className="text-slate-400 hover:text-slate-600" aria-label="Back to History">
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Compare Properties</h1>
        <Button size="sm" variant="ghost" onClick={clear} className="ml-auto" aria-label="Clear all properties">
          Clear all
        </Button>
      </div>

      {/* ── Quick verdict strip ── */}
      {items.length >= 2 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3" role="region" aria-label="Comparison summary">

          <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <TrendingDown size={18} className="text-blue-500 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-[11px] text-blue-600 font-semibold uppercase tracking-wide">Cheapest</p>
              <p className="text-sm font-bold text-blue-800">
                Property {cheapestIdx + 1} — {formatCurrency(minPrice)}
              </p>
              {priceDelta > 0 && (
                <p className="text-[11px] text-blue-500 mt-0.5">
                  saves {formatCurrency(priceDelta)} vs most expensive
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <DollarSign size={18} className="text-emerald-500 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-[11px] text-emerald-600 font-semibold uppercase tracking-wide">Best Value / sq ft</p>
              <p className="text-sm font-bold text-emerald-800">
                Property {bestValueIdx + 1} — ${pricePerSqFt(items[bestValueIdx]).toFixed(0)}/sq ft
              </p>
              <p className="text-[11px] text-emerald-500 mt-0.5">most space for your money</p>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <GraduationCap size={18} className="text-amber-500 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-[11px] text-amber-600 font-semibold uppercase tracking-wide">Best School Zone</p>
              <p className="text-sm font-bold text-amber-800">
                Property {bestSchoolIdx + 1} — {items[bestSchoolIdx].school_rating} / 10
              </p>
              <p className="text-[11px] text-amber-500 mt-0.5">top-rated nearby schools</p>
            </div>
          </div>

        </div>
      )}

      {/* ── Property cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {items.map((item, i) => {
          const conf = item.confidence ?? "high";
          const { label: confLabel, className: confClass } = CONFIDENCE_BADGE[conf as Confidence];
          const isCheapest  = i === cheapestIdx;
          const isBestValue = i === bestValueIdx && !isCheapest;

          return (
            <Card key={item.id}>
              <CardHeader className="flex items-center justify-between py-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold" style={{ color: COLORS[i] }}>P{i + 1}</span>
                  {isCheapest && items.length > 1 && (
                    <span className="text-[10px] bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5 font-semibold">
                      cheapest
                    </span>
                  )}
                  {isBestValue && (
                    <span className="text-[10px] bg-emerald-100 text-emerald-700 rounded-full px-1.5 py-0.5 font-semibold">
                      best value
                    </span>
                  )}
                </div>
                <button
                  onClick={() => remove(item.id)}
                  className="text-slate-300 hover:text-red-400"
                  aria-label={`Remove Property ${i + 1}`}
                >
                  <X size={14} aria-hidden="true" />
                </button>
              </CardHeader>
              <CardBody className="space-y-2.5 text-sm pt-0">
                <div>
                  <p className="text-2xl font-bold" style={{ color: COLORS[i] }}>
                    {formatCurrency(item.predicted_price)}
                  </p>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${confClass}`}>
                    {confLabel}
                  </span>
                </div>
                {/* Mini stat grid */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs rounded-lg p-2.5"
                     style={{ background: COLORS_LIGHT[i] }}>
                  <span className="text-slate-500">Size</span>
                  <span className="font-semibold text-slate-700 text-right">{item.square_footage.toLocaleString()} sqft</span>
                  <span className="text-slate-500">$/sqft</span>
                  <span className="font-semibold text-slate-700 text-right">${pricePerSqFt(item).toFixed(0)}</span>
                  <span className="text-slate-500">Beds / Baths</span>
                  <span className="font-semibold text-slate-700 text-right">{item.bedrooms}bd / {item.bathrooms}ba</span>
                  <span className="text-slate-500">School</span>
                  <span className="font-semibold text-slate-700 text-right">{item.school_rating} / 10</span>
                  <span className="text-slate-500">City dist.</span>
                  <span className="font-semibold text-slate-700 text-right">{item.distance_to_city_center} mi</span>
                  <span className="text-slate-500">Built</span>
                  <span className="font-semibold text-slate-700 text-right">{item.year_built}</span>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>

      {items.length >= 2 && (
        <>
          {/* ── Price comparison bar chart ── */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Award size={15} className="text-slate-400" aria-hidden="true" />
                <h2 className="font-semibold text-slate-800">Price at a Glance</h2>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Estimated market value — the lower the bar, the better for a buyer
              </p>
            </CardHeader>
            <CardBody className="pt-0">
              <PriceChart items={items} />
            </CardBody>
          </Card>

          {/* ── Decision table ── */}
          <Card>
            <CardHeader>
              <h2 className="font-semibold text-slate-800">Feature-by-Feature Breakdown</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                ✓ best marks the most favourable value in each row
              </p>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Property feature comparison">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide w-36">
                      Feature
                    </th>
                    {items.map((_, i) => (
                      <th
                        key={i}
                        scope="col"
                        className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide"
                        style={{ color: COLORS[i] }}
                      >
                        Property {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">

                  {/* Est. Price */}
                  <tr className="bg-slate-50/50">
                    <td className="px-4 py-3 text-xs font-semibold text-slate-500 whitespace-nowrap">
                      Est. Price
                    </td>
                    {items.map((item, i) => (
                      <td key={i} className="px-4 py-3 font-bold tabular-nums" style={{ color: COLORS[i] }}>
                        {formatCurrency(item.predicted_price)}
                        {item.predicted_price === minPrice && items.length > 1 && (
                          <span className="ml-1.5 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-1.5 py-0.5 font-semibold">
                            ✓ best
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>

                  <FeatureRow label="Value ($/sq ft)"  items={items} getValue={pricePerSqFt}           format={(v) => `$${v.toFixed(0)}`}         higherIsBetter={false} />
                  <FeatureRow label="Size (sq ft)"     items={items} getValue={(it) => it.square_footage}          format={(v) => v.toLocaleString()}         higherIsBetter={true}  />
                  <FeatureRow label="Bedrooms"         items={items} getValue={(it) => it.bedrooms}                format={(v) => `${v} bed`}                 higherIsBetter={true}  />
                  <FeatureRow label="Bathrooms"        items={items} getValue={(it) => it.bathrooms}               format={(v) => `${v} bath`}                higherIsBetter={true}  />
                  <FeatureRow label="School Rating"    items={items} getValue={(it) => it.school_rating}           format={(v) => `${v} / 10`}                higherIsBetter={true}  />
                  <FeatureRow label="City Distance"    items={items} getValue={(it) => it.distance_to_city_center} format={(v) => `${v} mi`}                  higherIsBetter={false} />
                  <FeatureRow label="Lot Size (sq ft)" items={items} getValue={(it) => it.lot_size}                format={(v) => v.toLocaleString()}         higherIsBetter={true}  />
                  <FeatureRow label="Year Built"       items={items} getValue={(it) => it.year_built}              format={(v) => String(v)}                  higherIsBetter={true}  />

                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
