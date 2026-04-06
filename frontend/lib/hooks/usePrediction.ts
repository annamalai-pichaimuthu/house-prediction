import { useState } from "react";
import { pythonClient, type PredictResponse, type HouseFeatures } from "@/lib/api/python-client";

export interface PredictionFormValues extends HouseFeatures {}

export function usePrediction() {
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState<PredictResponse | null>(null);
  const [error,      setError]      = useState<string | null>(null);
  const [fillValues, setFillValues] = useState<HouseFeatures | null>(null);

  async function predict(values: HouseFeatures) {
    setLoading(true);
    setError(null);
    setResult(null);
    setFillValues(null);
    try {
      const res = await pythonClient.predict(values);
      setResult(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Prediction failed");
    } finally {
      setLoading(false);
    }
  }

  function useSuggestion(features: HouseFeatures) {
    setFillValues(features);
    setResult(null);
  }

  return { loading, result, error, predict, fillValues, useSuggestion };
}
