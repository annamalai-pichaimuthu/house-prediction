"use client";

import Link from "next/link";
import { ArrowLeft, FileText, FileSpreadsheet, Download } from "lucide-react";
import { Card, CardBody } from "@/components/shared/Card";
import Button from "@/components/shared/Button";
import { javaClient } from "@/lib/api/java-client";
import { parseApiError } from "@/lib/utils";
import { useState } from "react";

type ExportType = "csv" | "pdf";

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportPage() {
  const [loading, setLoading] = useState<ExportType | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  async function handleExport(type: ExportType) {
    setLoading(type);
    setError(null);
    try {
      const blob     = await javaClient.exportFile(type);
      const filename = type === "csv" ? "housing-market.csv" : "housing-market-report.pdf";
      triggerDownload(blob, filename);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setLoading(null);
    }
  }

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

      <div className="grid sm:grid-cols-2 gap-6">
        <Card>
          <CardBody className="space-y-4 p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-50 rounded-xl">
                <FileSpreadsheet size={24} className="text-emerald-600" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">CSV Export</h2>
                <p className="text-xs text-slate-500">Structured data — open in Excel or Sheets</p>
              </div>
            </div>
            <ul className="text-sm text-slate-500 space-y-1">
              <li>• Market overview — average, median &amp; price range</li>
              <li>• What adds value — estimated impact per feature</li>
              <li>• Best space for your money — top picks by size per dollar</li>
              <li>• Best school zone value — top picks for families</li>
              <li>• Opens in Excel, Google Sheets, or any CSV viewer</li>
            </ul>
            <Button variant="secondary" className="w-full" loading={loading === "csv"} onClick={() => handleExport("csv")}>
              <Download size={14} /> Download CSV
            </Button>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="space-y-4 p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-50 rounded-xl">
                <FileText size={24} className="text-blue-600" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">PDF Report</h2>
                <p className="text-xs text-slate-500">Formatted report — ready to share</p>
              </div>
            </div>
            <ul className="text-sm text-slate-500 space-y-1">
              <li>• Market overview with key price statistics</li>
              <li>• Top value drivers — what moves property prices</li>
              <li>• Best space-for-money property profiles</li>
              <li>• Best school zone value property profiles</li>
              <li>• Ready to share with clients or stakeholders</li>
            </ul>
            <Button variant="primary" className="w-full" loading={loading === "pdf"} onClick={() => handleExport("pdf")}>
              <Download size={14} /> Download PDF
            </Button>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
