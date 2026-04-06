/**
 * Typed client for the Python backend (backend-python).
 * Calls the backend directly from the browser.
 */

const BASE = process.env.NEXT_PUBLIC_PYTHON_API_URL ?? "http://localhost:8001";

export interface HouseFeatures {
  square_footage: number;
  bedrooms: number;
  bathrooms: number;
  year_built: number;
  lot_size: number;
  distance_to_city_center: number;
  school_rating: number;
}

export type Confidence = "high" | "medium" | "low";

export interface AdjustedField {
  field:     string;
  label:     string;
  original:  number;
  suggested: number;
}

export interface Suggestion {
  adjusted_fields:    AdjustedField[];
  suggested_features: HouseFeatures;
  suggested_price:    number;
}

export interface FeatureContribution {
  feature:      string;   // machine name, e.g. "school_rating"
  label:        string;   // human label,  e.g. "School Rating"
  value:        number;   // the input value the user provided
  contribution: number;   // dollar impact on this specific prediction
}

export interface PredictResponse {
  predicted_price: number;
  currency: string;
  confidence: Confidence;
  suggestion?: Suggestion;
  contributions: FeatureContribution[];
}

export interface BatchPredictResponse {
  predictions: number[];
  confidences: Confidence[];
  count: number;
  currency: string;
}

export interface HistoryItem {
  id: number;
  created_at: string;
  square_footage: number;
  bedrooms: number;
  bathrooms: number;
  year_built: number;
  lot_size: number;
  distance_to_city_center: number;
  school_rating: number;
  predicted_price: number;
  confidence: Confidence;
}

export interface HistoryResponse {
  count: number;
  items: HistoryItem[];
}

export interface ModelInfoResponse {
  model_type: string;
  alpha: number;
  coefficients: Record<string, number>;
  metrics: Record<string, number>;
  feature_columns: string[];
}

/** Shape of a single Pydantic v2 validation error detail entry. */
interface PydanticErrorDetail {
  loc:  (string | number)[];
  msg:  string;
  type: string;
}

/**
 * Parse a FastAPI 422 Unprocessable Entity response body into a readable
 * string such as:
 *   "square_footage: Value must be greater than 0  |  bathrooms: Input should be ≤ 10"
 */
function parsePydanticError(body: unknown): string {
  if (
    body !== null &&
    typeof body === "object" &&
    "detail" in body &&
    Array.isArray((body as { detail: unknown }).detail)
  ) {
    const details = (body as { detail: PydanticErrorDetail[] }).detail;
    return details
      .map((d) => {
        // loc = ["body", "features", "square_footage"] — skip the first two wrappers
        const field = d.loc
          .filter((seg) => seg !== "body" && seg !== "features")
          .join(".");
        return field ? `${field}: ${d.msg}` : d.msg;
      })
      .join("  |  ");
  }
  return "Validation failed — please check your inputs.";
}

const DEFAULT_TIMEOUT_MS = 15_000;

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const signal = AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
  const res = await fetch(`${BASE}${path}`, { ...init, signal });
  if (!res.ok) {
    let body: unknown;
    try { body = await res.json(); } catch { body = await res.text(); }

    if (res.status === 422) {
      throw new Error(parsePydanticError(body));
    }
    const text = typeof body === "string" ? body : JSON.stringify(body);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const pythonClient = {
  predict(features: HouseFeatures): Promise<PredictResponse> {
    return apiFetch("/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ features }),
    });
  },

  predictBatch(features: HouseFeatures[]): Promise<BatchPredictResponse> {
    return apiFetch("/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ features }),
    });
  },

  getHistory(): Promise<HistoryResponse> {
    return apiFetch("/history");
  },

  deleteHistory(id: number): Promise<void> {
    return apiFetch(`/history/${id}`, { method: "DELETE" });
  },

  getModelInfo(): Promise<ModelInfoResponse> {
    return apiFetch("/model-info");
  },
};
