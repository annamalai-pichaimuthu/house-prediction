"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { X, ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { javaClient, type HouseRecord } from "@/lib/api/java-client";
import { formatCurrency } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type SortKey = keyof HouseRecord;
type SortDir = "asc" | "desc";

interface ColDef {
  key:     SortKey;
  label:   string;
  format:  (v: number) => string;
  filterType: "number" | "text";
}

// ── Column definitions ───────────────────────────────────────────────────────

const COLS: ColDef[] = [
  { key: "squareFootage",        label: "Size (sq ft)",     format: (v) => v.toLocaleString(),          filterType: "number" },
  { key: "bedrooms",             label: "Beds",             format: (v) => String(v),                   filterType: "number" },
  { key: "bathrooms",            label: "Baths",            format: (v) => v.toFixed(1),                filterType: "number" },
  { key: "yearBuilt",            label: "Year Built",       format: (v) => String(v),                   filterType: "number" },
  { key: "lotSize",              label: "Lot (sq ft)",      format: (v) => v.toLocaleString(),          filterType: "number" },
  { key: "distanceToCityCenter", label: "City Dist. (mi)", format: (v) => v.toFixed(1),                filterType: "number" },
  { key: "schoolRating",         label: "School",           format: (v) => `${v.toFixed(1)} / 10`,     filterType: "number" },
  { key: "price",                label: "Price",            format: (v) => formatCurrency(Math.round(v)), filterType: "number" },
];

const PAGE_SIZES = [10, 25, 50, 100];

// ── Sort icon ────────────────────────────────────────────────────────────────

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ArrowUpDown size={12} className="text-slate-300" />;
  return sortDir === "asc"
    ? <ArrowUp size={12} className="text-emerald-500" />
    : <ArrowDown size={12} className="text-emerald-500" />;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PropertyTableModal({ onClose }: { onClose: () => void }) {
  // ── Data ───────────────────────────────────────────────────────────────────
  const [rows,    setRows]    = useState<HouseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    javaClient.getProperties()
      .then(setRows)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load properties"))
      .finally(() => setLoading(false));
  }, []);

  // ── Sort ───────────────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey>("price");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // ── Column filters ─────────────────────────────────────────────────────────
  // Each column filter is a string: "" = no filter; "3" = exact match; "3-5" = range
  const [filters, setFilters] = useState<Partial<Record<SortKey, string>>>({});

  function setFilter(key: SortKey, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(0);
  }

  function clearFilters() {
    setFilters({});
    setPage(0);
  }

  const anyFilter = Object.values(filters).some((v) => v && v.trim() !== "");

  // ── Derived filtered + sorted rows ────────────────────────────────────────
  const processed = useMemo(() => {
    let result = [...rows];

    // Apply per-column filters
    for (const col of COLS) {
      const raw = filters[col.key]?.trim();
      if (!raw) continue;
      // Range syntax: "min-max" (e.g. "200000-400000")
      const rangeParts = raw.split("-").map((p) => p.trim()).filter(Boolean);
      if (rangeParts.length === 2) {
        const lo = parseFloat(rangeParts[0]);
        const hi = parseFloat(rangeParts[1]);
        if (!isNaN(lo) && !isNaN(hi)) {
          result = result.filter((r) => {
            const v = r[col.key] as number;
            return v >= lo && v <= hi;
          });
          continue;
        }
      }
      // Exact / prefix match
      const term = raw.toLowerCase();
      result = result.filter((r) => {
        const formatted = col.format(r[col.key] as number).toLowerCase();
        return formatted.includes(term) || String(r[col.key]).includes(term);
      });
    }

    // Sort
    result.sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortDir === "asc" ? av - bv : bv - av;
    });

    return result;
  }, [rows, filters, sortKey, sortDir]);

  // ── Pagination ─────────────────────────────────────────────────────────────
  const [pageSize, setPageSize] = useState(25);
  const [page,     setPage]     = useState(0);

  const totalPages = Math.max(1, Math.ceil(processed.length / pageSize));
  const safePage   = Math.min(page, totalPages - 1);
  const pageRows   = processed.slice(safePage * pageSize, safePage * pageSize + pageSize);

  // ── Global search ──────────────────────────────────────────────────────────
  const [globalSearch, setGlobalSearch] = useState("");

  const displayed = useMemo(() => {
    if (!globalSearch.trim()) return pageRows;
    const term = globalSearch.toLowerCase();
    return pageRows.filter((r) =>
      COLS.some((c) => c.format(r[c.key] as number).toLowerCase().includes(term))
    );
  }, [pageRows, globalSearch]);

  // ── Close on Escape ────────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Trap focus inside modal
  const modalRef = useRef<HTMLDivElement>(null);
  useEffect(() => { modalRef.current?.focus(); }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Property dataset table"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={modalRef}
        tabIndex={-1}
        className="relative z-10 flex flex-col bg-white rounded-2xl shadow-2xl
                   w-full max-w-6xl max-h-[90vh] outline-none"
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Property Dataset</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {loading ? "Loading…" : `${processed.length.toLocaleString()} of ${rows.length.toLocaleString()} properties`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
            aria-label="Close property table"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Toolbar ── */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-100 bg-slate-50 shrink-0 flex-wrap">
          {/* Global search */}
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search all columns…"
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white
                         focus:outline-none focus:ring-2 focus:ring-emerald-400 w-52"
              aria-label="Search all columns"
            />
          </div>

          {anyFilter && (
            <button
              onClick={clearFilters}
              className="text-xs text-red-500 hover:text-red-700 border border-red-200 rounded-lg
                         px-2.5 py-1.5 bg-white hover:bg-red-50 transition-colors"
            >
              Clear column filters
            </button>
          )}

          {/* Page size */}
          <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
            <span>Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
              className="border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-sm
                         focus:outline-none focus:ring-2 focus:ring-emerald-400"
              aria-label="Rows per page"
            >
              {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
              Loading properties…
            </div>
          )}
          {error && (
            <div className="flex items-center justify-center h-48 text-red-500 text-sm px-6 text-center">
              {error}
            </div>
          )}
          {!loading && !error && (
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10 bg-white shadow-sm">
                {/* ── Sort header ── */}
                <tr className="border-b border-slate-200">
                  {COLS.map((col) => (
                    <th
                      key={col.key}
                      className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600
                                 uppercase tracking-wide whitespace-nowrap cursor-pointer
                                 hover:bg-slate-50 select-none"
                      onClick={() => toggleSort(col.key)}
                      aria-sort={
                        sortKey === col.key
                          ? sortDir === "asc" ? "ascending" : "descending"
                          : "none"
                      }
                    >
                      <span className="flex items-center gap-1.5">
                        {col.label}
                        <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />
                      </span>
                    </th>
                  ))}
                </tr>
                {/* ── Column filter row ── */}
                <tr className="border-b border-slate-100 bg-slate-50">
                  {COLS.map((col) => (
                    <th key={col.key} className="px-2 py-1.5">
                      <input
                        type="text"
                        value={filters[col.key] ?? ""}
                        onChange={(e) => setFilter(col.key, e.target.value)}
                        placeholder={col.filterType === "number" ? "e.g. 3 or 2-5" : "filter…"}
                        className="w-full px-2 py-1 text-xs border border-slate-200 rounded
                                   bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400
                                   font-normal placeholder:text-slate-300"
                        aria-label={`Filter by ${col.label}`}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayed.length === 0 && (
                  <tr>
                    <td colSpan={COLS.length} className="px-4 py-10 text-center text-slate-400 text-sm italic">
                      No properties match the current filters.
                    </td>
                  </tr>
                )}
                {displayed.map((r, i) => (
                  <tr
                    key={r.id}
                    className={`hover:bg-emerald-50/40 transition-colors ${i % 2 === 0 ? "" : "bg-slate-50/50"}`}
                  >
                    <td className="px-3 py-2 tabular-nums">{r.squareFootage.toLocaleString()}</td>
                    <td className="px-3 py-2 tabular-nums">{r.bedrooms}</td>
                    <td className="px-3 py-2 tabular-nums">{r.bathrooms.toFixed(1)}</td>
                    <td className="px-3 py-2 tabular-nums">{r.yearBuilt}</td>
                    <td className="px-3 py-2 tabular-nums">{r.lotSize.toLocaleString()}</td>
                    <td className="px-3 py-2 tabular-nums">{r.distanceToCityCenter.toFixed(1)}</td>
                    <td className="px-3 py-2 tabular-nums">{r.schoolRating.toFixed(1)}</td>
                    <td className="px-3 py-2 tabular-nums font-medium text-slate-700">
                      {formatCurrency(Math.round(r.price))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Pagination footer ── */}
        {!loading && !error && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 bg-slate-50 shrink-0 flex-wrap gap-2">
            <p className="text-xs text-slate-500">
              Showing{" "}
              <span className="font-semibold text-slate-700">
                {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, processed.length)}
              </span>{" "}
              of{" "}
              <span className="font-semibold text-slate-700">{processed.length.toLocaleString()}</span>
              {anyFilter && <span className="text-slate-400"> (filtered)</span>}
            </p>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(0)}
                disabled={safePage === 0}
                className="px-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white
                           disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-colors"
                aria-label="First page"
              >
                «
              </button>
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="px-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white
                           disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-colors"
                aria-label="Previous page"
              >
                <ChevronLeft size={14} />
              </button>

              {/* Page number pills — show up to 5 around current page */}
              {Array.from({ length: totalPages }, (_, i) => i)
                .filter((i) => Math.abs(i - safePage) <= 2)
                .map((i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i)}
                    className={`px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
                      i === safePage
                        ? "bg-emerald-600 border-emerald-600 text-white font-semibold"
                        : "border-slate-200 bg-white hover:bg-slate-100 text-slate-600"
                    }`}
                    aria-label={`Page ${i + 1}`}
                    aria-current={i === safePage ? "page" : undefined}
                  >
                    {i + 1}
                  </button>
                ))}

              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage >= totalPages - 1}
                className="px-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white
                           disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-colors"
                aria-label="Next page"
              >
                <ChevronRight size={14} />
              </button>
              <button
                onClick={() => setPage(totalPages - 1)}
                disabled={safePage >= totalPages - 1}
                className="px-2 py-1.5 text-xs rounded-lg border border-slate-200 bg-white
                           disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 transition-colors"
                aria-label="Last page"
              >
                »
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
