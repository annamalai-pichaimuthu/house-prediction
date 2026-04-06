"use client";

import { useState, useMemo } from "react";
import { Trash2, PlusCircle, ArrowLeft, ChevronUp, ChevronDown, ChevronsUpDown, Search, X } from "lucide-react";
import Link from "next/link";
import type { Confidence, HistoryItem } from "@/lib/api/python-client";
import { useComparisonStore } from "@/store/comparison";
import { Card, CardHeader, CardBody } from "@/components/shared/Card";
import Button from "@/components/shared/Button";
import Spinner from "@/components/shared/Spinner";
import { formatCurrency, formatDate, parseApiError } from "@/lib/utils";
import { useHistory } from "@/lib/hooks/useHistory";

const CONFIDENCE_BADGE: Record<Confidence, { label: string; className: string }> = {
  high:   { label: "High",     className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  medium: { label: "Moderate", className: "bg-amber-50 text-amber-700 border-amber-200"      },
  low:    { label: "Low",      className: "bg-orange-50 text-orange-700 border-orange-200"    },
};

type SortKey = keyof Pick<
  HistoryItem,
  "created_at" | "square_footage" | "bedrooms" | "bathrooms" |
  "year_built" | "lot_size" | "distance_to_city_center" | "school_rating" |
  "predicted_price" | "confidence"
>;
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "created_at",              label: "Date"            },
  { key: "square_footage",          label: "Sq Ft"           },
  { key: "bedrooms",                label: "Bed"             },
  { key: "bathrooms",               label: "Bath"            },
  { key: "year_built",              label: "Year"            },
  { key: "lot_size",                label: "Lot"             },
  { key: "distance_to_city_center", label: "Dist (mi)"       },
  { key: "school_rating",           label: "School"          },
  { key: "predicted_price",         label: "Predicted Price" },
  { key: "confidence",              label: "Confidence"      },
];

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown size={12} className="text-slate-300 ml-1 inline" />;
  return sortDir === "asc"
    ? <ChevronUp   size={12} className="text-blue-500 ml-1 inline" />
    : <ChevronDown size={12} className="text-blue-500 ml-1 inline" />;
}

export default function HistoryPage() {
  const { items, loading, error, deleteItem } = useHistory();
  const { add: addToCompare, items: compareItems } = useComparisonStore();

  const [sortKey,    setSortKey]    = useState<SortKey>("created_at");
  const [sortDir,    setSortDir]    = useState<SortDir>("desc");
  const [search,     setSearch]     = useState("");
  const [confFilter, setConfFilter] = useState<Confidence | "all">("all");

  function handleSort(col: SortKey) {
    if (col === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir("asc");
    }
  }

  const processed = useMemo(() => {
    let rows = [...items];

    // Confidence filter
    if (confFilter !== "all") {
      rows = rows.filter((r) => (r.confidence ?? "high") === confFilter);
    }

    // Search — matches price, numeric fields, and confidence as plain text
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) =>
        [
          formatCurrency(r.predicted_price),
          String(r.square_footage),
          String(r.bedrooms),
          String(r.bathrooms),
          String(r.year_built),
          String(r.school_rating),
          r.confidence ?? "high",
        ]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }

    // Sort
    rows.sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [items, confFilter, search, sortKey, sortDir]);

  if (loading) return <Spinner />;
  if (error)   return <p className="text-red-500">{parseApiError(error)}</p>;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/value-estimator"
          className="text-slate-400 hover:text-slate-600"
          aria-label="Back to Value Estimator"
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Prediction History</h1>
        <span
          className="ml-auto text-sm text-slate-500"
          role="status"
          aria-live="polite"
          aria-label={`Showing ${processed.length} of ${items.length} records`}
        >
          {processed.length} of {items.length} records
        </span>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardBody className="text-center py-16 text-slate-400">
            No predictions yet.{" "}
            <Link href="/value-estimator" className="text-blue-600 underline">Make one →</Link>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="font-semibold text-slate-800">All Predictions</span>
              <Link href="/value-estimator/compare" className="text-sm text-blue-600 hover:underline shrink-0">
                View Compare ({compareItems.length}/4)
              </Link>
            </div>

            {/* Filter bar */}
            <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Filter predictions">
              <div className="relative flex-1 min-w-[180px]">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  id="history-search"
                  type="search"
                  placeholder="Search price, beds, school…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Search predictions"
                  className="w-full pl-7 pr-7 py-1.5 text-sm border border-slate-200 rounded-lg
                             focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                )}
              </div>

              <label htmlFor="conf-filter" className="sr-only">Filter by confidence</label>
              <select
                id="conf-filter"
                value={confFilter}
                onChange={(e) => setConfFilter(e.target.value as Confidence | "all")}
                aria-label="Filter by confidence level"
                className="text-sm border border-slate-200 rounded-lg px-2.5 py-1.5
                           focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
              >
                <option value="all">All confidence</option>
                <option value="high">High</option>
                <option value="medium">Moderate</option>
                <option value="low">Low</option>
              </select>
            </div>
          </CardHeader>

          {processed.length === 0 ? (
            <CardBody className="text-center py-10 text-slate-400 text-sm">
              No records match your filters.{" "}
              <button
                onClick={() => { setSearch(""); setConfFilter("all"); }}
                className="text-blue-600 hover:underline"
              >
                Clear filters
              </button>
            </CardBody>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Prediction history">
                <caption className="sr-only">
                  Your past property value predictions. Click a column header to sort.
                </caption>
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {COLUMNS.map(({ key, label }) => (
                      <th
                        key={key}
                        scope="col"
                        onClick={() => handleSort(key)}
                        aria-sort={
                          sortKey === key
                            ? sortDir === "asc" ? "ascending" : "descending"
                            : "none"
                        }
                        className="px-4 py-3 text-left text-xs font-medium text-slate-500
                                   uppercase tracking-wide cursor-pointer select-none
                                   hover:bg-slate-100 transition-colors whitespace-nowrap"
                      >
                        {label}
                        <SortIcon col={key} sortKey={sortKey} sortDir={sortDir} />
                      </th>
                    ))}
                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {processed.map((item) => {
                    const inCompare = compareItems.some((c) => c.id === item.id);
                    const { label, className } = CONFIDENCE_BADGE[item.confidence ?? "high"];
                    return (
                      <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatDate(item.created_at)}</td>
                        <td className="px-4 py-3">{item.square_footage.toLocaleString()}</td>
                        <td className="px-4 py-3">{item.bedrooms}</td>
                        <td className="px-4 py-3">{item.bathrooms}</td>
                        <td className="px-4 py-3">{item.year_built}</td>
                        <td className="px-4 py-3">{item.lot_size.toLocaleString()}</td>
                        <td className="px-4 py-3">{item.distance_to_city_center}</td>
                        <td className="px-4 py-3">{item.school_rating}</td>
                        <td className="px-4 py-3 font-semibold text-blue-600 whitespace-nowrap">
                          {formatCurrency(item.predicted_price)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${className}`}>
                            {label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant={inCompare ? "ghost" : "primary"}
                              onClick={() => addToCompare(item)}
                              disabled={inCompare || compareItems.length >= 4}
                              aria-label={inCompare ? "Already in compare" : "Add to compare"}
                            >
                              <PlusCircle size={13} aria-hidden="true" />
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => deleteItem(item.id)}
                              aria-label={`Delete prediction from ${formatDate(item.created_at)}`}
                            >
                              <Trash2 size={13} aria-hidden="true" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
