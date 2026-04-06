import { Card, CardBody } from "@/components/shared/Card";

function SkeletonLine({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-slate-200 rounded ${className}`}
      aria-hidden="true"
    />
  );
}

function KpiSkeleton() {
  return (
    <Card>
      <CardBody className="space-y-2">
        <SkeletonLine className="h-3 w-24" />
        <SkeletonLine className="h-8 w-32" />
        <SkeletonLine className="h-3 w-20" />
      </CardBody>
    </Card>
  );
}

function ChartSkeleton({ height = "h-48" }: { height?: string }) {
  return (
    <Card>
      <CardBody className="space-y-3">
        <SkeletonLine className="h-5 w-40" />
        <SkeletonLine className={`w-full rounded-lg ${height}`} />
      </CardBody>
    </Card>
  );
}

export default function MarketAnalysisLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8" aria-busy="true" aria-label="Loading Market Analysis">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <SkeletonLine className="h-8 w-56" />
          <SkeletonLine className="h-4 w-72" />
        </div>
        <div className="flex gap-2">
          <SkeletonLine className="h-9 w-28 rounded-lg" />
          <SkeletonLine className="h-9 w-24 rounded-lg" />
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <KpiSkeleton key={i} />
        ))}
      </div>

      {/* Distribution charts */}
      <div className="space-y-3">
        <SkeletonLine className="h-6 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <ChartSkeleton key={i} />
          ))}
        </div>
      </div>

      {/* Segment pricing */}
      <div className="space-y-3">
        <SkeletonLine className="h-6 w-56" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <ChartSkeleton key={i} />
          ))}
        </div>
      </div>

      {/* Price drivers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartSkeleton height="h-52" />
        <ChartSkeleton height="h-52" />
      </div>

      {/* Best value tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartSkeleton height="h-40" />
        <ChartSkeleton height="h-40" />
      </div>
    </div>
  );
}
