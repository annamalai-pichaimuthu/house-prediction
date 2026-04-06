import Link from "next/link";
import { Home, TrendingUp, DollarSign, MoveLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 text-center">
      {/* 404 graphic */}
      <div className="relative mb-8">
        <p className="text-[120px] font-black text-slate-100 leading-none select-none" aria-hidden="true">
          404
        </p>
        <div className="absolute inset-0 flex items-center justify-center">
          <Home size={48} className="text-slate-400" />
        </div>
      </div>

      {/* Heading */}
      <h1 className="text-2xl font-bold text-slate-800 mb-2">Page Not Found</h1>
      <p className="text-slate-500 max-w-sm mb-8">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
        Here are some helpful links to get you back on track.
      </p>

      {/* Action links */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg
                     bg-slate-800 text-white text-sm font-medium
                     hover:bg-slate-700 transition-colors focus:outline-none
                     focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
        >
          <MoveLeft size={16} aria-hidden="true" />
          Back to Home
        </Link>

        <Link
          href="/value-estimator"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg
                     bg-blue-600 text-white text-sm font-medium
                     hover:bg-blue-700 transition-colors focus:outline-none
                     focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          <DollarSign size={16} aria-hidden="true" />
          Value Estimator
        </Link>

        <Link
          href="/market-analysis"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg
                     bg-emerald-600 text-white text-sm font-medium
                     hover:bg-emerald-700 transition-colors focus:outline-none
                     focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
        >
          <TrendingUp size={16} aria-hidden="true" />
          Market Analysis
        </Link>
      </div>
    </div>
  );
}
