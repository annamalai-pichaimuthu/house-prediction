"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import Link from "next/link";

export default function ValueEstimatorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ValueEstimator Error]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] space-y-5 text-center px-4">
      <div className="bg-red-50 border border-red-200 rounded-full p-4">
        <AlertTriangle size={32} className="text-red-500" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-slate-800">Something went wrong</h2>
        <p className="text-sm text-slate-500 mt-1">
          The Property Value Estimator encountered an error.
        </p>
        {error.message && (
          <p className="text-xs text-slate-400 mt-2 font-mono bg-slate-50 px-3 py-1 rounded max-w-sm mx-auto truncate">
            {error.message}
          </p>
        )}
      </div>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="flex items-center gap-2 text-sm font-medium bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <RefreshCw size={14} /> Try again
        </button>
        <Link
          href="/"
          className="flex items-center gap-2 text-sm font-medium text-slate-600 px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
