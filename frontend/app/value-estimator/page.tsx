"use client";

import Link from "next/link";
import { History, GitCompare, AlertTriangle } from "lucide-react";
import PredictionForm, { PredictionFormValues } from "@/components/value-estimator/PredictionForm";
import ResultCard from "@/components/value-estimator/ResultCard";
import { Card, CardHeader, CardBody } from "@/components/shared/Card";
import type { HouseFeatures } from "@/lib/api/python-client";
import { usePrediction } from "@/lib/hooks/usePrediction";
import { parseApiError } from "@/lib/utils";

export default function ValueEstimatorPage() {
  const { loading, result, error, predict, fillValues, useSuggestion } = usePrediction();

  async function handleSubmit(values: PredictionFormValues) {
    await predict(values);
  }

  function handleUseSuggestion(features: HouseFeatures) {
    useSuggestion(features);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Property Value Estimator</h1>
          <p className="text-slate-500 text-sm mt-1">Get an instant AI-powered valuation for any residential property</p>
        </div>
        <div className="flex gap-2">
          <Link href="/value-estimator/history" className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-blue-600 px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors">
            <History size={15} /> History
          </Link>
          <Link href="/value-estimator/compare" className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-blue-600 px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors">
            <GitCompare size={15} /> Compare
          </Link>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <h2 className="font-semibold text-slate-800">Property Details</h2>
          </CardHeader>
          <CardBody>
            <PredictionForm
              onSubmit={handleSubmit}
              loading={loading}
              fillValues={fillValues}
            />
            {error && (
              <div className="mt-3 flex gap-2 items-start text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2.5 rounded-lg">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <p>{parseApiError(error)}</p>
              </div>
            )}
          </CardBody>
        </Card>

        <div>
          {result ? (
            <ResultCard
              predictedPrice={result.predicted_price}
              contributions={result.contributions ?? []}
              confidence={result.confidence}
              suggestion={result.suggestion}
              onUseSuggestion={handleUseSuggestion}
            />
          ) : (
            <Card>
              <CardBody className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-2">
                <span className="text-4xl">🏡</span>
                <p className="text-sm">Fill in property details and click Predict</p>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
