"use client";

import Link from "next/link";
import { ArrowLeft, FileText, FileSpreadsheet, Download } from "lucide-react";
import { Card, CardHeader, CardBody } from "@/components/shared/Card";
import Button from "@/components/shared/Button";
import { javaClient, type ExportSections } from "@/lib/api/java-client";
import { parseApiError } from "@/lib/utils";
import { useState } from "react";

type ExportType = "csv" | "pdf";

const SECTIONS: { key: keyof ExportSections; label: string; description: string }[] = [
  {
    key:         "includeOverview",
    label:       "Market Overview",
    description: "Avg price, median, price range, avg size, year built & school rating",
  },
  {
    key:         "includeSegments",
    label:       "Segment Pricing",
    description: "Avg price broken down by bedroom count, school zone & location zone",
  },
  {
    key:         "includeDrivers",
    label:       "Price Drivers",
    description: "Which features move the price most and by how much per unit",
  },
  {
    key:         "includeTopPicks",
    label:       "Top Picks",
    description: "Best space-for-money properties and best school zone value properties",
  },
  {
    key:         "includeListing",
    label:       "Full Property Listing",
    description: "All 50 properties from the dataset with every attribute",
  },
];

const ALL_ON: ExportSections = {
  includeOverview: true,
  includeSegments: true,
  includeDrivers:  true,
  includeTopPicks: true,
  includeListing:  true,
};

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportPage() {
  const [sections, setSections] = useState<ExportSections>(ALL_ON);
  const [loading,  setLoading]  = useState<ExportType | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  const noneSelected = !Object.values(sections).some(Boolean);

  function toggle(key: keyof ExportSections) {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function selectAll()   { setSections(ALL_ON); }
  function deselectAll() { setSections({ includeOverview: false, includeSegments: false, includeDrivers: false, includeTopPicks: false, includeListing: false }); }

  async function handleExport(type: ExportType) {
    setLoading(type);
    setError(null);
    try {
      const blob     = await javaClient.exportFile(type, sections);
      const filename = type === "csv" ? "housing-market.csv" : "housing-market-report.pdf";
      triggerDownload(blob, filename);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setLoading(null);
    }
  }

  const selectedCount = Object.values(sections).filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/market-analysis" className="text-slate-400 hover:text-slate-600">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">Export Market Report</h1>
      </div>

      {error && (
        <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{parseApiError(error)}</p>
      )}

      {/* ── Section picker ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-800">Choose what to include</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {selectedCount === 0
                  ? "Select at least one section to export"
                  : `${selectedCount} of ${SECTIONS.length} sections selected`}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={selectAll}
                className="text-xs text-emerald-600 hover:underline font-medium"
              >
                Select all
              </button>
              <span className="text-slate-300">|</span>
              <button
                onClick={deselectAll}
                className="text-xs text-slate-400 hover:underline"
              >
                Clear
              </button>
            </div>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          <ul className="divide-y divide-slate-100">
            {SECTIONS.map(({ key, label, description }) => (
              <li key={key}>
                <label className="flex items-start gap-4 px-5 py-3.5 cursor-pointer hover:bg-slate-50 transition-colors">
                  <input
                    type="checkbox"
                    checked={sections[key]}
                    onChange={() => toggle(key)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 accent-emerald-600 cursor-pointer shrink-0"
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-800">{label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{description}</p>
                  </div>
                </label>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {/* ── Download buttons ── */}
      {noneSelected && (
        <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
          Select at least one section above before downloading.
        </p>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <CardBody className="flex items-center gap-4 p-5">
            <div className="p-3 bg-emerald-50 rounded-xl shrink-0">
              <FileSpreadsheet size={22} className="text-emerald-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-900 text-sm">CSV Export</p>
              <p className="text-xs text-slate-500 mt-0.5">Open in Excel, Google Sheets, or any CSV viewer</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={noneSelected}
              loading={loading === "csv"}
              onClick={() => handleExport("csv")}
              className="shrink-0"
            >
              <Download size={13} /> Download
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="flex items-center gap-4 p-5">
            <div className="p-3 bg-blue-50 rounded-xl shrink-0">
              <FileText size={22} className="text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-slate-900 text-sm">PDF Report</p>
              <p className="text-xs text-slate-500 mt-0.5">Formatted report — ready to share or print</p>
            </div>
            <Button
              variant="primary"
              size="sm"
              disabled={noneSelected}
              loading={loading === "pdf"}
              onClick={() => handleExport("pdf")}
              className="shrink-0"
            >
              <Download size={13} /> Download
            </Button>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
