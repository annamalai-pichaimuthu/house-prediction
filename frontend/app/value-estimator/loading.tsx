import { Card, CardBody } from "@/components/shared/Card";

function SkeletonLine({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-slate-200 rounded ${className}`}
      aria-hidden="true"
    />
  );
}

function FormSkeleton() {
  return (
    <Card>
      <CardBody className="space-y-4">
        <SkeletonLine className="h-5 w-40 mb-2" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <SkeletonLine className="h-4 w-32" />
              <SkeletonLine className="h-9 w-full" />
              <SkeletonLine className="h-3 w-3/4" />
            </div>
          ))}
        </div>
        <SkeletonLine className="h-11 w-full rounded-lg mt-2" />
      </CardBody>
    </Card>
  );
}

function ResultSkeleton() {
  return (
    <Card>
      <CardBody className="space-y-5">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <SkeletonLine className="h-4 w-24" />
            <SkeletonLine className="h-10 w-48" />
          </div>
          <SkeletonLine className="h-6 w-28 rounded-full" />
        </div>
        <div className="space-y-2">
          <SkeletonLine className="h-4 w-36" />
          <SkeletonLine className="h-44 w-full rounded-lg" />
        </div>
      </CardBody>
    </Card>
  );
}

export default function ValueEstimatorLoading() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6" aria-busy="true" aria-label="Loading Value Estimator">
      {/* Page heading skeleton */}
      <div className="space-y-2">
        <SkeletonLine className="h-8 w-64" />
        <SkeletonLine className="h-4 w-80" />
      </div>

      {/* Nav links skeleton */}
      <div className="flex gap-3">
        <SkeletonLine className="h-8 w-28 rounded-full" />
        <SkeletonLine className="h-8 w-24 rounded-full" />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FormSkeleton />
        <ResultSkeleton />
      </div>
    </div>
  );
}
