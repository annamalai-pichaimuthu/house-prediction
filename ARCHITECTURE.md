# HousingAI Portal — Architecture & Implementation Reference

> **Date:** April 2026  
> **Stack:** Python 3.12 · FastAPI · Java 21 · Spring Boot 3.4 · Next.js 14 · SQLite · Scikit-learn · Recharts  
> **Services:** 4 independent processes, each with its own environment file

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Service Architecture](#2-service-architecture)
3. [ML Model Service (`ml-model`, port 8000)](#3-ml-model-service)
4. [Python Backend (`backend-python`, port 8001)](#4-python-backend)
5. [Java Backend (`backend-java`, port 9090)](#5-java-backend)
6. [Frontend (`frontend`, port 3000)](#6-frontend)
7. [Data Flow — End to End](#7-data-flow-end-to-end)
8. [Performance Strategies](#8-performance-strategies)
9. [Error Handling & Validation](#9-error-handling--validation)
10. [Configuration & Environment](#10-configuration--environment)
11. [Assumed Scenarios & Design Decisions](#11-assumed-scenarios--design-decisions)
12. [API Reference Summary](#12-api-reference-summary)

---

## 1. System Overview

HousingAI Portal is a **four-service application** for residential property price prediction and market analysis. The services are deliberately split by responsibility rather than combined into a monolith:

```
Browser
  │
  ├──── Next.js (port 3000) ──────────────────────┐
  │        UI, routing, state                      │
  │        ┌──────────────┐  ┌──────────────────┐ │
  │        │ /predict     │  │ /market-analysis │ │
  │        └──────┬───────┘  └────────┬─────────┘ │
  │               │                   │            │
  │    FastAPI (port 8001)    Spring Boot (9090)   │
  │    Prediction + History   Market Analytics     │
  │               │                   │            │
  │               └─────────┬─────────┘            │
  │                         │                      │
  │                FastAPI (port 8000)              │
  │                ML Model Inference               │
  └─────────────────────────────────────────────────┘
```

| Service | Language | Responsibility |
|---|---|---|
| `ml-model` | Python / FastAPI | Ridge regression inference, model metadata |
| `backend-python` | Python / FastAPI | Prediction proxy, history persistence, clamping |
| `backend-java` | Java / Spring Boot | Market analytics, what-if, export |
| `frontend` | TypeScript / Next.js | UI, routing, state management |

**Key architectural principle:** The ML model is the single source of truth for training ranges, coefficients, and inference. Both backends query it — neither re-implements any model logic.

---

## 2. Service Architecture

### Communication Pattern

```
frontend  ──HTTP──►  backend-python  ──HTTP──►  ml-model
frontend  ──HTTP──►  backend-java    ──HTTP──►  ml-model
```

- All inter-service communication is **synchronous HTTP** (REST + JSON)
- No message queue, no gRPC — kept simple intentionally
- `backend-java` and `backend-python` never talk to each other
- The frontend talks directly to both backends from the browser

### Port Assignment

| Service | Port | Env Var |
|---|---|---|
| ml-model | 8000 | `ML_MODEL_PORT` |
| backend-python | 8001 | `BACKEND_PYTHON_PORT` |
| backend-java | 9090 | `BACKEND_JAVA_PORT` |
| frontend | 3000 | — (Next.js default) |

---

## 3. ML Model Service

**Location:** `ml-model/`  
**Framework:** FastAPI 0.11x, scikit-learn, joblib, numpy  
**Entry point:** `ml-model/app/main.py`

### 3.1 Model

**Algorithm:** Ridge Regression with `alpha=1.0`  
**Pipeline:** `StandardScaler → Ridge`  
**Features (7):**

| Feature | Type | Unit |
|---|---|---|
| `square_footage` | float | sq ft |
| `bedrooms` | int | count |
| `bathrooms` | float | count |
| `year_built` | int | year |
| `lot_size` | float | sq ft |
| `distance_to_city_center` | float | miles |
| `school_rating` | float | 0–10 |

**Training split:** 80/20, random seed 42  
**Validation:** 5-fold cross-validation R²  
**Reported metrics (current model):** R² = 0.9857, RMSE = $8,948, MAE = $8,629, CV R² = 0.9852 ± 0.0075

### 3.2 Training Pipeline (`train.py`)

The training script runs **once at Docker build time** (or manually). It:

1. Loads `House_Price_Dataset.csv`
2. Validates all required columns are present
3. Splits 80/20 with fixed seed
4. Fits `StandardScaler → Ridge(alpha=1.0)`
5. Evaluates on held-out test set (R², RMSE, MAE)
6. Runs 5-fold CV on the full dataset
7. **Back-transforms coefficients** from scaled space to original feature units for interpretability: `coeff_original = ridge.coef_ / scaler.scale_`
8. Computes `training_ranges` as per-feature `[min, max]` from the **full dataset** (not just the training split)
9. Serialises the pipeline to `app/model.joblib` via joblib (compression=3)
10. Writes all metadata to `app/model_meta.json`

**Why full-dataset ranges?** Using training-split ranges would exclude the top 20% of feature values (the test set). Using full-dataset ranges gives the most accurate bounds for the clamping guard in `backend-python`.

### 3.3 Startup Lifecycle

Uses FastAPI's `@asynccontextmanager` lifespan:

```python
@asynccontextmanager
async def lifespan(app):
    state.model   = joblib.load(MODEL_PATH)        # sklearn pipeline
    state.executor = ThreadPoolExecutor(max_workers=MAX_WORKERS)
    state.meta    = json.load(open(META_PATH))     # model_meta.json
    yield
    state.executor.shutdown(wait=False)
```

If either file is missing or corrupt, the app **fails fast at startup** — it does not start in a degraded state.

### 3.4 Inference Architecture

Scikit-learn's `predict()` is **CPU-bound** (numpy BLAS calls). Running it directly on FastAPI's async event loop would block all other requests. The solution:

```python
loop = asyncio.get_event_loop()
predictions = await loop.run_in_executor(state.executor, _run_inference, X)
```

`_run_inference` runs in a `ThreadPoolExecutor` with `MAX_WORKERS = min(4, cpu_count)`. This keeps the event loop free to accept new connections while inference runs in a thread.

### 3.5 Confidence Scoring

Confidence is computed **at the ML model** via `compute_confidence()` in `schemas.py`:

```python
out_of_range = sum(
    1 for field, (lo, hi) in TRAINING_RANGES.items()
    if not (lo <= getattr(features, field) <= hi)
)
# 0 out-of-range → "high", 1 → "medium", 2+ → "low"
```

This is an out-of-distribution indicator, not a statistical confidence interval. It tells the user how many of their input features fall outside what the model was trained on.

### 3.6 Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness probe — reads in-memory state only, no inference |
| GET | `/model-info` | Coefficients, metrics, training ranges, intercept |
| POST | `/predict` | Single or batch inference (up to 10,000 records) |

**Single vs Batch dispatch:** The same `/predict` endpoint handles both. Pydantic's `Union[HouseFeatures, list[HouseFeatures]]` discriminates at parse time. The response type changes accordingly (`SinglePrediction` vs `BatchPrediction`).

### 3.7 Middleware

- **GZipMiddleware** (minimum_size=1024): compresses responses larger than 1 KB. Critical for batch responses of thousands of predictions.

### 3.8 Metadata File (`model_meta.json`)

Persisted by `train.py`, loaded at startup, served via `/model-info`. Contains:

```json
{
  "feature_columns": [...],
  "model_type": "Ridge Regression",
  "alpha": 1.0,
  "training_rows": 40,
  "test_rows": 10,
  "metrics": { "r2_score": 0.9857, "rmse": 8948.69, ... },
  "coefficients": { "square_footage": 1.7835, ... },
  "intercept": 270375.0,
  "training_ranges": { "square_footage": [980.0, 4900.0], ... }
}
```

Both backends consume this file indirectly via the `/model-info` endpoint — they do not read the JSON file directly.

---

## 4. Python Backend

**Location:** `backend-python/`  
**Framework:** FastAPI, SQLAlchemy (async), httpx, pydantic-settings  
**Database:** SQLite via `aiosqlite`  
**Entry point:** `backend-python/app/main.py`

### 4.1 Responsibility

This service is a **prediction proxy with persistence**. It:
- Accepts user inputs, forwards them to `ml-model`
- Persists every single prediction to SQLite history
- Computes feature contributions (dollar impact per feature)
- Provides the clamping/suggestion system for out-of-range inputs
- Exposes history CRUD

It does **not** do inference itself — it always delegates to `ml-model`.

### 4.2 Router Structure

```
app/
├── main.py              # FastAPI app, CORS, lifespan, global handler
├── config.py            # pydantic-settings, loads .env
├── database.py          # SQLAlchemy models, engine, session factory
├── schemas.py           # Pydantic request/response models
└── routers/
    ├── predict.py       # POST /predict, POST /predict/batch
    ├── history.py       # GET /history, DELETE /history/{id}
    └── model_info.py    # GET /model-info (proxy to ml-model)
```

### 4.3 Prediction Flow (Single)

```
POST /predict
    │
    ├─ Validate: reject list input (use /predict/batch)
    ├─ Forward to ml-model /predict → predicted_price, confidence
    │
    ├─ If predicted_price ≤ 0:
    │     ├─ Fetch training_ranges from ml-model (cached)
    │     ├─ Clamp all out-of-range features to nearest boundary
    │     ├─ Re-predict with clamped features
    │     └─ Build Suggestion{adjusted_fields, suggested_features, suggested_price}
    │
    ├─ Persist PredictionRecord to SQLite (best-effort, non-blocking)
    │
    └─ Return PredictResponse{
           predicted_price, confidence,
           suggestion?,
           contributions: [FeatureContribution sorted by |impact|]
       }
```

### 4.4 Feature Contribution Calculation

For a linear model, the dollar contribution of feature $i$ is:

$$\text{contribution}_i = \text{coefficient}_i \times \text{value}_i$$

Coefficients are fetched from `ml-model /model-info` **once** and cached in module-level `_cached_coefficients`. The sorted list (by absolute contribution, descending) is returned with every prediction so the UI can render the "What drives this price?" chart.

### 4.5 Clamping System

**Problem:** Linear regression has no bounds — extreme inputs produce negative or astronomical prices. The model was trained on a specific distribution; predictions outside that distribution are unreliable.

**Solution:**

```python
async def _get_training_ranges() -> dict[str, tuple[float, float]]:
    # Fetches from ml-model /model-info once, caches in _cached_ranges
    ...

def _clamp_features(features, training_ranges):
    # For each feature, clamp to [lo, hi]
    # Return (HouseFeatures, list[AdjustedField])
    ...
```

If the raw prediction is ≤ 0, the clamped features are re-predicted and returned as a `Suggestion`. The original (negative) prediction is still returned so the frontend can decide what to display. The suggestion is **never blocking** — failure to build it is logged as a warning and the response returns without it.

### 4.6 Module-Level Caches

Two module-global caches avoid redundant HTTP calls to `ml-model`:

| Cache | Variable | Content |
|---|---|---|
| Coefficients | `_cached_coefficients` | `dict[str, float]` |
| Training ranges | `_cached_ranges` | `dict[str, tuple[float, float]]` |

Both are populated on first use and held for the lifetime of the process. They reset on service restart, which is the intended refresh mechanism after a model retrain.

### 4.7 Database Layer

**ORM:** SQLAlchemy 2.x async with `mapped_column` typed ORM.  
**Engine:** `create_async_engine` with `aiosqlite` driver.  
**Session:** `async_sessionmaker` with `expire_on_commit=False` to avoid lazy-load after commit.

`PredictionRecord` schema:

| Column | Type | Notes |
|---|---|---|
| `id` | Integer PK | autoincrement |
| `created_at` | DateTime (UTC) | default `datetime.now(timezone.utc)` |
| `square_footage` ... `school_rating` | Float/Integer | all 7 input features |
| `predicted_price` | Float | |
| `confidence` | String(6) | "high" / "medium" / "low" |

Tables are created via `Base.metadata.create_all` in the startup lifespan — **schema-on-startup**, no migrations required for this dataset scale.

### 4.8 History API

| Method | Path | Behaviour |
|---|---|---|
| GET | `/history` | All records, newest first (`ORDER BY created_at DESC`) |
| DELETE | `/history/{id}` | 204 on success, 404 if not found |

Batch predictions are intentionally **not persisted** — only single predictions that the user consciously submits.

### 4.9 CORS

```python
CORSMiddleware(allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
```

Wildcard in development. Should be restricted to specific origins (e.g. `FRONTEND_URL`) in production.

---

## 5. Java Backend

**Location:** `backend-java/`  
**Framework:** Spring Boot 3.4, Java 21, Spring Cache, Caffeine, RestClient, iTextPDF, springdoc-openapi  
**Entry point:** `HousingApplication.java`

### 5.1 Responsibility

This service provides **market-level analytics** derived entirely from model inference — no raw dataset access. It treats the ML model as a function and systematically samples it to produce aggregate insights.

### 5.2 Package Structure

```
com.housing/
├── HousingApplication.java
├── config/
│   ├── CacheConfig.java           # Caffeine cache definitions
│   ├── CorsConfig.java            # CORS filter
│   ├── GlobalExceptionHandler.java # RFC 9457 ProblemDetail responses
│   ├── OpenApiConfig.java         # Swagger/OpenAPI metadata
│   ├── RestClientConfig.java      # Spring RestClient bean
│   └── WhatIfRangesConfig.java    # @ConfigurationProperties for UI bounds
├── controller/
│   ├── HealthController.java
│   └── MarketController.java      # /api/market/*
├── service/
│   ├── CacheRefreshService.java   # Scheduled cache eviction
│   ├── ExportService.java         # CSV + PDF generation
│   ├── MarketService.java         # Core analytics logic
│   └── MlModelClient.java         # HTTP client for ml-model
└── model/dto/                     # Java records for all API shapes
```

### 5.3 Market Analytics — How It Works

All statistics and segments are **model-derived** — the Java backend calls the ML model's batch predict endpoint with synthetic inputs and interprets the results. No raw data is stored or queried.

#### Statistics

Three synthetic property configurations are predicted:
- `synthLow` — all features at training minimums (farthest from city, lowest school rating)
- `midpoint` — all features at training midpoints
- `synthHigh` — all features at training maximums (closest to city, highest school rating)

The price range `[min, max, avg]` is derived from these three predictions.

#### Segment Insights

Three segmentation dimensions are computed:

**By Bedrooms:** 3 evenly-spaced bedroom counts across the training range, all other features held at midpoints.

**By School Tier:** Training range divided into 3 equal zones. Each zone's centre is predicted. Labels are dynamic:
```
"Low (< 7.2)", "Mid (7.2 – 8.1)", "High (≥ 8.1)"
```
Zone boundaries are computed at runtime from `training_ranges` — they are not hardcoded.

**By Location Zone:** Same 3-zone approach on `distance_to_city_center`:
```
"Urban (≤ 3.5 mi)", "Suburban (3.5–6.1 mi)", "Outer (> 6.1 mi)"
```

#### Price Drivers

Coefficients from `ml-model /model-info` are mapped to `SensitivityEntry{priceChangePerUnit, unit}` and sorted by absolute value descending. This gives "school rating adds $18,057 per point" type annotations.

#### Best-Value Grid Search

288 combinations are evaluated:
- 6 square footage values × 3 bedroom counts × 4 school ratings × 4 city distances
- Bathrooms, year built, lot size held at midpoints
- Each combo is predicted in one batch call
- Results scored by `pricePerSqFt` and `schoolPer100k` (school rating / price per $100k)
- Top 8 by each metric returned as `ValueSpot[]`

### 5.4 What-If Analysis

```
POST /api/market/whatif
    │
    ├─ Validate WhatIfRequest (@Valid Bean Validation)
    ├─ Call ml-model /predict → predictedPrice
    ├─ Fetch cached statistics → avgPrice
    └─ Return WhatIfResponse{
           predictedPrice, currency, request,
           MarketComparison{avgPrice, diff, pct},
           coefficients (SensitivityEntry per feature)
       }
```

The `MarketComparison` shows how the what-if scenario compares to the market average — e.g. "+$45,200 (+12.3%) above average".

### 5.5 WhatIfRangesConfig

Separate from training ranges — these are **human-facing UI slider bounds** defined in `application.yml`:

```yaml
what-if:
  ranges:
    square-footage: { min: 100, max: 20000 }
    year-built:     { min: 1800, max: 0 }    # 0 = current year at runtime
```

`WhatIfRangesConfig` is a `@ConfigurationProperties` bean. The `year-built.max: 0` sentinel is resolved to `Year.now().getValue()` at call time in `toApiMap()`. This avoids having to update the config every year.

### 5.6 Caching Strategy

All expensive operations are cached using **Caffeine** (in-memory, JVM-local):

| Cache | Content | Expense |
|---|---|---|
| `modelInfo` | ML model metadata | 1 HTTP call |
| `modelCoefficients` | Feature coefficients | Derived from modelInfo |
| `statistics` | Market KPIs | 3 ML predictions |
| `insights` | Full segment analysis | 288 ML predictions |

**Cache size:** Each cache holds max 10 entries (effectively 1 — there are no per-user or parameterised keys). `recordStats()` enables hit/miss metrics.

**Cache refresh:** `CacheRefreshService` uses `@Scheduled` + `@CacheEvict`:

```java
@Scheduled(fixedDelayString = "${cache.refresh-interval-ms:600000}",
           initialDelayString = "${cache.initial-delay-ms:30000}")
@CacheEvict(cacheNames = {"modelInfo", "modelCoefficients", "statistics", "insights"},
            allEntries = true)
public void evictAll() { ... }
```

- All 4 caches are evicted together (consistent — they all derive from the same ML model state)
- Default: 10-minute refresh, 30-second initial delay after startup
- Configurable per environment via `CACHE_REFRESH_MS`, `CACHE_INITIAL_DELAY_MS`
- The 30-second initial delay prevents a cold-start spike if the ML model isn't ready yet

### 5.7 Export Service

**CSV:** Market summary stats, top price drivers, and best-value configurations serialised to RFC 4180 CSV using `StringWriter`.

**PDF:** Generated with iTextPDF — title page, market statistics table, price drivers table, best-value tables (by price efficiency and school value). No raw dataset rows — all model-derived.

### 5.8 Error Handling

`GlobalExceptionHandler` maps exceptions to **RFC 9457 ProblemDetail** responses:

| Exception | HTTP Status | Title |
|---|---|---|
| `MethodArgumentNotValidException` | 400 | Validation Failed |
| `RuntimeException` | 503 | Service Error |

ProblemDetail includes `type` (URI), `title`, and `detail` fields. Field-level validation errors are concatenated: `"squareFootage: must be greater than 0; bedrooms: must be ≤ 20"`.

---

## 6. Frontend

**Location:** `frontend/`  
**Framework:** Next.js 14 App Router, TypeScript, Tailwind CSS, Recharts, Zustand, React Hook Form + Zod v4  
**Port:** 3000

### 6.1 App Structure

```
app/
├── layout.tsx                   # RSC — skip link, Navbar, main wrapper
├── page.tsx                     # RSC — homepage with two app cards
├── value-estimator/
│   ├── page.tsx                 # Client — prediction form + result
│   ├── error.tsx                # Client — error boundary (Next.js required)
│   ├── history/
│   │   └── page.tsx             # Client — sortable, filterable history table
│   └── compare/
│       └── page.tsx             # Client — side-by-side property comparison
└── market-analysis/
    └── page.tsx                 # Client — market dashboard
```

### 6.2 React Server vs Client Components

| File | Type | Reason |
|---|---|---|
| `layout.tsx` | RSC | No hooks, pure markup |
| `page.tsx` (homepage) | RSC | No hooks, static content |
| All other pages | Client (`"use client"`) | Need `useState`, `useEffect`, or Zustand |
| `Navbar.tsx` | Client | Needs `usePathname()` for active link |
| `Card.tsx`, `Spinner.tsx` | Usable as RSC | No hooks — zero JS bundle cost |

### 6.3 Typed API Clients

Two thin client modules in `lib/api/`:

**`python-client.ts`** — talks to `backend-python`:
- `pythonClient.predict(features)` → `PredictResponse`
- `pythonClient.predictBatch(features[])` → `BatchPredictResponse`
- `pythonClient.getHistory()` → `HistoryResponse`
- `pythonClient.deleteHistory(id)` → void
- `pythonClient.getModelInfo()` → `ModelInfoResponse`

**`java-client.ts`** — talks to `backend-java`:
- `javaClient.getInsights()` → `InsightsResponse`
- `javaClient.getStatistics()` → `MarketStatistics`
- `javaClient.whatIf(request)` → `WhatIfResponse`
- `javaClient.exportCsv()` → triggers download
- `javaClient.exportPdf()` → triggers download

Both clients share the same `apiFetch<T>()` wrapper which:
1. Makes the `fetch` call
2. On 422 — parses Pydantic error detail array and formats it as `"field: message | field: message"`
3. On other non-2xx — throws `Error("status: body")`
4. On success — returns typed JSON

### 6.4 Custom Hooks

| Hook | File | Wraps |
|---|---|---|
| `usePrediction` | `lib/hooks/usePrediction.ts` | `pythonClient.predict` |
| `useHistory` | `lib/hooks/useHistory.ts` | `pythonClient.getHistory`, `.deleteHistory` |
| `useMarketInsights` | `lib/hooks/useMarketData.ts` | `javaClient.getInsights` |
| `useMarketStatistics` | `lib/hooks/useMarketData.ts` | `javaClient.getStatistics` |
| `useWhatIf` | `lib/hooks/useMarketData.ts` | `javaClient.whatIf` — debounced on slider change |

### 6.5 Comparison Store (Zustand)

```typescript
// store/comparison.ts
useComparisonStore = create(persist({
  items: HistoryItem[],   // max 4, no duplicates (by id)
  add(item),
  remove(id),
  clear(),
}, { name: "comparison-store" }))
```

- Persisted to `localStorage` via `zustand/middleware/persist`
- Max 4 items enforced in `add()`
- Duplicate guard: checks `id` equality before adding
- Used in history page (Add to Compare button) and compare page (display + remove)

### 6.6 Value Estimator Page

**Flow:**
1. User fills `PredictionForm` (React Hook Form + Zod)
2. `usePrediction.predict()` calls `pythonClient.predict()`
3. `ResultCard` renders predicted price, confidence badge, contribution bar chart or table (toggle)
4. If `suggestion` is present — yellow warning card lists adjusted fields and alternative price with "Use this suggestion" button
5. Clicking "Use this suggestion" calls `useSuggestion(features)` which populates the form with the clamped values

### 6.7 History Page

Features:
- **Sort:** Every column is sortable (click header to cycle asc/desc/none)
- **Filter:** Text search across all fields + confidence dropdown filter
- `aria-sort` on `<th>` elements for screen readers
- **Add to Compare:** Calls `useComparisonStore.add()` — button disabled when store is full or item already added
- **Delete:** Calls `pythonClient.deleteHistory(id)` then refreshes

### 6.8 Compare Page

Renders up to 4 `HistoryItem` objects from the Zustand store:

1. **Quick verdict strip** — "Cheapest", "Best Value $/sqft", "Best School Zone" callout cards
2. **Property cards** — mini stat grid per property with colour-coded accents and "cheapest"/"best value" badges
3. **Price bar chart** — horizontal Recharts `BarChart` with actual dollar values and `LabelList` showing formatted price
4. **Feature-by-feature table** — `FeatureRow` component for each metric:
   - Highlights the best cell per row with a "✓ best" badge
   - Shows "low" badge on the worst value (only when 3+ properties)
   - `higherIsBetter` prop controls which end is "best" (distance and $/sqft use `false`)

### 6.9 Market Analysis Page

Four sections driven by `useMarketInsights` + `useMarketStatistics`:

1. **KPI strip** — min/max/avg price, avg square footage, school rating
2. **Segment charts** — three `SegmentChart` (Recharts BarChart) components for bedrooms, school tier, location zone. Each has a filter dropdown — selecting a value dims non-selected bars via per-`<Cell>` fill-opacity.
3. **Price drivers** — horizontal bar chart coloured green (positive coefficient) / red (negative)
4. **Best-value picks** — two `ValueTable` components (by $/sqft and by school/$)

### 6.10 WCAG Accessibility

Applied across all interactive pages:

- `aria-label` on all icon-only buttons
- `aria-current="page"` on active nav link
- `aria-sort="ascending|descending|none"` on sortable table headers
- `aria-live="polite"` on loading/result regions
- `role="alert"` on form validation errors
- `aria-required`, `aria-invalid`, `aria-describedby` on all form inputs
- `aria-pressed` on toggle buttons (chart/table view)
- `scope="col"` and `<caption className="sr-only">` on all data tables
- Skip-to-content link in `layout.tsx` (`sr-only`, visible on focus)
- `id="main-content"` on `<main>` for the skip link target

---

## 7. Data Flow — End to End

### 7.1 Single Prediction

```
User fills form
    → PredictionForm validates with Zod (client-side, immediate)
    → usePrediction.predict()
    → pythonClient.predict(features)
        → POST backend-python /predict
            → POST ml-model /predict
                → sklearn pipeline.predict(X)
                → compute_confidence(features)
            ← SinglePrediction{predicted_price, confidence}
            → _compute_contributions (coefficients × values)
            → persist to SQLite (async, non-blocking)
        ← PredictResponse{price, confidence, contributions, suggestion?}
    ← ResultCard renders price + contributions chart
```

### 7.2 Market Insights (first load)

```
useMarketInsights mounts
    → javaClient.getInsights()
        → GET backend-java /api/market/insights
            → Cache MISS on "insights"
            → mlModelClient.getModelInfo() → Cache MISS on "modelInfo"
                → GET ml-model /model-info
                ← MlModelInfo{trainingRanges, coefficients, ...}
            → Compute 9 segment inputs (3 bedroom + 3 school + 3 location)
            → mlModelClient.batchPredict(9 inputs)
                → POST ml-model /predict (batch)
            → Compute 288 grid inputs for best-value search
            → mlModelClient.batchPredict(288 inputs)
                → POST ml-model /predict (batch)
            → Build InsightsResponse
            → Store in Caffeine cache "insights"
        ← InsightsResponse
    ← Market dashboard renders segments, drivers, picks
```

Subsequent requests within the cache TTL skip all ML model calls entirely.

---

## 8. Performance Strategies

### 8.1 ML Model — Thread Pool for Inference

```python
loop = asyncio.get_event_loop()
predictions = await loop.run_in_executor(state.executor, _run_inference, X)
```

Prevents numpy/BLAS CPU work from blocking FastAPI's event loop. `MAX_WORKERS = min(4, cpu_count)` limits thread count to avoid thrashing.

### 8.2 ML Model — GZip Compression

```python
app.add_middleware(GZipMiddleware, minimum_size=1024)
```

Batch responses (e.g. 288 predictions = ~15KB JSON) are compressed before transmission to `backend-java`, reducing inter-service network overhead.

### 8.3 ML Model — Single Endpoint for Single and Batch

The same `/predict` endpoint handles both. This avoids round-trip overhead when `backend-java` needs to send 288 synthetic inputs — it sends one batch request, not 288 individual requests. The batch-limit guard (`> 10,000`) prevents abuse.

### 8.4 Python Backend — Module-Level Caches

`_cached_coefficients` and `_cached_ranges` are populated from `ml-model /model-info` **once per process lifetime**. Every prediction after the first avoids an HTTP round-trip. Both are reset on service restart (the intended refresh mechanism after retraining).

### 8.5 Java Backend — Caffeine Cache

Four named caches with `maximumSize=10` and `recordStats()`. The most expensive operation (insights, 288 ML predictions) is cached — under normal usage it is computed once and served from memory for up to 10 minutes.

The `@Cacheable` annotation on `getModelInfo()` means that `MarketService` calling `mlModelClient.getModelInfo()` multiple times per insights computation returns the cached result after the first call.

### 8.6 Java Backend — Scheduled Cache Eviction

Rather than TTL-based expiry (which would cause different caches to expire at different times and temporarily serve inconsistent data), all four caches are evicted **together** on a fixed schedule. This ensures `statistics`, `insights`, `modelInfo`, and `modelCoefficients` are always in sync.

### 8.7 Frontend — Custom Hooks with Single Fetch

Each hook (`useMarketInsights`, `useMarketStatistics`, `usePrediction`) fetches once on mount. No polling. The market data is re-fetched only on page reload — appropriate for a dataset that changes on model retrain, not in real time.

### 8.8 Frontend — Zustand with localStorage Persistence

Comparison state survives browser refresh without any server round-trip. The store holds `HistoryItem` objects (full data), so the compare page renders instantly from localStorage with no additional API call.

### 8.9 Coefficient Back-Transformation

```python
coef_original = ridge.coef_ / scaler.scale_
```

StandardScaler normalises features before Ridge regression. The fitted coefficients are in the scaled feature space. Dividing by `scaler.scale_` transforms them back to original units ($/sq ft, $/bedroom, etc.), making them directly interpretable for the "feature contributions" feature without any runtime math.

---

## 9. Error Handling & Validation

### 9.1 Input Validation — Three Layers

**Layer 1 — Frontend (Zod):**  
Immediate, client-side. Form does not submit until valid. Errors shown inline next to each field with `role="alert"`.

**Layer 2 — Python Backend (Pydantic):**  
`HouseFeatures` model validates on parse:
- `square_footage > 0`
- `bedrooms: 1–20`
- `bathrooms: 0.5–20`
- `year_built: 1950–2050`
- `lot_size > 0`
- `distance_to_city_center ≥ 0`
- `school_rating: 0–10`
- Batch limit: max 10,000 records

Pydantic 422 errors are parsed by `parsePydanticError()` in the frontend client and shown as readable messages.

**Layer 3 — Java Backend (Bean Validation):**  
`@Valid` on `WhatIfRequest` in `MarketController`. `GlobalExceptionHandler` catches `MethodArgumentNotValidException` and returns RFC 9457 ProblemDetail.

### 9.2 ML Model Errors — Python Backend

| Scenario | Handling |
|---|---|
| `HTTPStatusError` from ml-model | 502 Bad Gateway with model's error body |
| `TimeoutException` (10s single, 30s batch) | 503 Service Unavailable |
| `RequestError` (ml-model unreachable) | 503 with connection error detail |
| predicted_price ≤ 0 | Build Suggestion (clamped re-prediction), return original price + suggestion |
| Suggestion build fails | Log warning, return response without suggestion (never block) |
| SQLite write fails | Log exception, return prediction anyway (persistence is best-effort) |

### 9.3 ML Model Errors — Java Backend

| Scenario | Handling |
|---|---|
| RestClientException on any ml-model call | Log warning, return null |
| `getModelInfo()` returns null | `RuntimeException("ML model unavailable")` → 503 via GlobalExceptionHandler |
| Individual batch price ≤ 0 | Excluded from `allSpots` in best-value grid |

### 9.4 Frontend Error Handling

| Layer | Mechanism |
|---|---|
| HTTP errors | `apiFetch` throws typed `Error` with status + body |
| Pydantic 422 | `parsePydanticError()` formats field-level messages |
| Hook-level errors | Each hook exposes `error: string | null` |
| Page-level | `error.tsx` Next.js error boundary per route segment |
| Render-level | `loading` / `error` guards in every page component |

### 9.5 Validation Error UX

**PredictionForm:**  
`aria-invalid`, `aria-describedby` pointing to `${name}-error` paragraph with `role="alert"`. Error appears below the field immediately on blur or submit attempt.

**WhatIf sliders:**  
Bounded by `WhatIfRangesConfig` values delivered from the backend — the slider itself cannot exceed valid bounds.

**Suggestion card:**  
When `suggestion` is returned (inputs outside training range), a yellow `AlertTriangle` card shows which fields were adjusted, their original vs. suggested values, and the alternative estimated price. The user can click "Use this suggestion" to populate the form with the clamped values.

---

## 10. Configuration & Environment

### 10.1 Per-Service Environment Files

Each service owns its environment completely — no shared root env file:

| Service | File | Loaded by |
|---|---|---|
| `ml-model` | `ml-model/.env` | `python-dotenv` (`load_dotenv`) |
| `backend-python` | `backend-python/.env` | `pydantic-settings` (`env_file`) |
| `backend-java` | `backend-java/.env.local` | `spring-dotenv` |
| `frontend` | `frontend/.env.local` | Next.js (built-in) |

Example files are committed (`.env.example` / `.env.local.example`). Actual `.env` files are gitignored.

### 10.2 Key Variables Per Service

**ml-model/.env:**
```
ML_MODEL_PORT=8000
MODEL_PATH=app/model.joblib
META_PATH=app/model_meta.json
APP_ENV=development
LOG_LEVEL=INFO
INFERENCE_WORKERS=4
```

**backend-python/.env:**
```
BACKEND_PYTHON_PORT=8001
ML_MODEL_URL=http://localhost:8000
DATABASE_URL=sqlite+aiosqlite:///./history.db
APP_ENV=development
LOG_LEVEL=INFO
```

**backend-java/.env.local:**
```
BACKEND_JAVA_PORT=9090
ML_MODEL_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3000
CACHE_REFRESH_MS=600000
CACHE_INITIAL_DELAY_MS=30000
LOG_LEVEL=INFO
```

**frontend/.env.local:**
```
NEXT_PUBLIC_PYTHON_API_URL=http://localhost:8001
NEXT_PUBLIC_JAVA_API_URL=http://localhost:9090
```

### 10.3 NEXT_PUBLIC_ Convention

Next.js only exposes environment variables to the browser bundle if they are prefixed `NEXT_PUBLIC_`. Variables without this prefix are server-side only and would be `undefined` in client components. Both API URL variables are `NEXT_PUBLIC_` because they are read by client components (`"use client"` pages).

### 10.4 What-If Range Configuration

UI slider bounds are in `application.yml` under `what-if.ranges.*`. These are **wider than training ranges** by design — they represent physically plausible values a user might explore, not the narrow distribution the training data covers. The `year-built.max: 0` sentinel resolves to the current calendar year at runtime.

---

## 11. Assumed Scenarios & Design Decisions

### 11.1 Small Training Dataset (50 rows)

The dataset has 50 rows (40 train, 10 test). Several design decisions account for this:

- **Ridge regression** over OLS — L2 regularisation prevents overfitting on small data
- **5-fold cross-validation** over single train/test split — more reliable performance estimate on small data
- **Training range clamping** — extreme inputs produce unreliable extrapolations; the suggestion system guides users back into the reliable zone
- **Synthetic inputs for analytics** — no raw data is stored or queried in the Java backend; all analytics are model-derived

### 11.2 Model Retraining Workflow

Assumed scenario: model is retrained periodically when new data arrives.

Design accommodates this:
- `train.py` writes `training_ranges` into `model_meta.json` from the actual dataset — ranges update automatically
- `backend-python` module caches are cleared on service restart
- `backend-java` cache is evicted on schedule (10-min default) and refreshes from the new model
- No code changes required after a retrain — only a service restart for `backend-python`

### 11.3 No Authentication

No user authentication is implemented. Assumed scenarios:

- Single-user local development tool
- Internal portal behind a corporate network/VPN
- Authentication would be added at the API gateway / reverse proxy layer before production

### 11.4 SQLite for History

SQLite is used for simplicity. Assumed:
- Single-instance deployment (no horizontal scaling of `backend-python`)
- Moderate history size (thousands of records, not millions)
- For multi-instance deployment, `DATABASE_URL` would be changed to PostgreSQL — the SQLAlchemy async driver supports both without code changes

### 11.5 Confidence as Out-of-Distribution Indicator

`confidence` ("high"/"medium"/"low") is not a statistical confidence interval from the model. It counts how many features fall outside training data bounds. Assumed:
- Users understand this as a reliability indicator ("how well does the model know this type of property")
- Not presented as a percentage or margin of error to avoid misinterpretation

### 11.6 Batch Predictions Not Persisted

Batch `/predict` calls bypass SQLite history. Assumed:
- Batch is used for programmatic/analytical purposes (e.g. the Java backend's grid search)
- Persisting thousands of synthetic ML queries would pollute the user's history
- The history is intended to reflect the user's own property valuations

### 11.7 CORS Wildcard

Both backends use `allow_origins=["*"]`. Assumed:
- Local development environment only in current state
- Production deployment would replace this with `FRONTEND_URL` specifically

### 11.8 What-If vs Training Ranges — Two Separate Concepts

Two distinct range concepts exist:

| Concept | Source | Purpose |
|---|---|---|
| `training_ranges` | `model_meta.json` (computed from dataset) | Clamping guard, confidence scoring, synthetic input generation |
| `whatIfRanges` | `application.yml` (manually configured) | UI slider bounds — wider than training, user-facing exploration |

They are deliberately kept separate so that the UI allows users to explore beyond training data (with a confidence warning) without conflating "what the model knows" with "what the user can enter".

### 11.9 Feature Contributions Are Absolute, Not Marginal

`contribution = coefficient × value` gives the absolute dollar amount each feature contributes to this specific prediction (relative to a baseline of zero). It is not a marginal effect ("adding one bedroom adds $X"). Assumed acceptable for a user-facing explanation tool — the absolute contributions sum to approximately the predicted price (plus intercept).

### 11.10 Java Backend Has No Direct Data Access

By design, `backend-java` has no database, no CSV file, and no knowledge of individual property records. It is purely a computation service over the ML model API. Consequence: segment charts show model-estimated averages, not statistical averages over real data. This is a deliberate trade-off for architectural simplicity — acknowledged in the UI with the "AI Estimate" badge on all market figures.

---

## 12. API Reference Summary

### ML Model (port 8000)

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/health` | — | `{status, model_loaded, model_type}` |
| GET | `/model-info` | — | `{model_type, metrics, coefficients, training_ranges, ...}` |
| POST | `/predict` | `{features: HouseFeatures}` | `SinglePrediction` or `BatchPrediction` |

### Python Backend (port 8001)

| Method | Path | Request | Response |
|---|---|---|---|
| POST | `/predict` | `{features: HouseFeatures}` | `PredictResponse` |
| POST | `/predict/batch` | `{features: HouseFeatures[]}` | `BatchPredictResponse` |
| GET | `/history` | — | `{count, items: HistoryItem[]}` |
| DELETE | `/history/{id}` | — | 204 |
| GET | `/model-info` | — | `ModelInfoResponse` |

### Java Backend (port 9090)

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/api/market/insights` | — | `InsightsResponse` (cached) |
| GET | `/api/market/statistics` | — | `MarketStatistics` (cached) |
| POST | `/api/market/whatif` | `WhatIfRequest` | `WhatIfResponse` |
| GET | `/api/market/export/csv` | — | CSV file download |
| GET | `/api/market/export/pdf` | — | PDF file download |
| GET | `/actuator/health` | — | Spring health detail |
| GET | `/swagger-ui.html` | — | Swagger UI |

---

*This document reflects the codebase as of April 2026. Update after any significant architectural change.*
