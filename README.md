# HousingAI Portal

A full-stack residential property price prediction and market analytics platform built with four independent services.

| Service | Stack | Port |
|---|---|---|
| **ML Model** | Python · FastAPI · scikit-learn (Ridge Regression) | `8000` |
| **Backend Python** | Python · FastAPI · SQLite (aiosqlite) | `8001` |
| **Backend Java** | Java 21 · Spring Boot 3.4 · Caffeine | `9090` |
| **Frontend** | Next.js 16 · TypeScript · Tailwind CSS 4 | `3000` |

---

## Features

### Value Estimator (`/value-estimator`)
- Predict a property price from 7 input features: square footage, bedrooms, bathrooms, year built, lot size, distance to city centre, school rating
- Per-feature dollar contribution breakdown — **chart and table view** with toggle
- Confidence indicator (high / medium / low) based on how far inputs are from training data
- Smart suggestion system — if inputs are out of range the app proposes the nearest viable values and an alternative price
- Full prediction history — sortable on every column, global search, confidence filter, optimistic delete
- Side-by-side comparison of up to 4 saved predictions with horizontal bar chart and per-metric decision table

### Market Analysis (`/market-analysis`)
- **Server-side pre-fetched** — page hydrates with data already present, no loading flash
- KPI strip: total properties (clickable), average/median price, price range, average property profile
- Dataset distribution charts — property count by bedroom count, school zone, and location zone
- Segment pricing charts — average price by bedroom count, school zone, and location zone
- Price correlation ranking — OLS β coefficient per feature (price change per unit), sorted by impact
- Best-value tables — top properties by price-per-sqft and school-rating-per-$100k
- What-If explorer — adjust any feature via slider, price updates automatically (300 ms debounce)
- **Property dataset modal** — click the "Properties Analysed" KPI to open a paginated, sortable, column-filterable table of the full CSV dataset
- Export market report as **CSV** or **PDF** with section picker (5 sections, each independently toggled)
- Manual cache refresh — clears Caffeine caches and reloads from the CSV dataset

---

## Architecture

```
Browser (Next.js 16 — port 3000)
  │
  │  Next.js API rewrites  (backend ports never exposed to the browser)
  │  /api/python/* ──────────────────────→ localhost:8001
  │  /api/java/*   ──────────────────────→ localhost:9090
  │
  ├── /value-estimator ──→ backend-python (port 8001)
  │                               │
  │                               └──→ ml-model (port 8000)   [inference]
  │
  └── /market-analysis ──→ backend-java (port 9090)
                                  │
                                  ├──→ ml-model (port 8000)   [what-if only]
                                  └──→ House_Price_Dataset.csv [all dashboard analytics]
```

### Service Responsibilities

| Service | Responsibility |
|---|---|
| **ml-model** | All sklearn inference — single + batch predict, model metadata, feature coefficients |
| **backend-python** | Proxies predictions, persists history to SQLite, computes feature contributions, handles out-of-range clamping and suggestions |
| **backend-java** | Loads CSV dataset at startup; derives all market analytics (stats, segments, OLS price drivers) from raw CSV rows — calls the ML model only for the interactive what-if tool |
| **frontend** | Next.js App Router — server components for initial data loading, `"use client"` only where interactivity is needed |

### Frontend Route Map

```
app/
 ├── layout.tsx                       ← RSC — root layout (Navbar, skip-link, metadata)
 ├── page.tsx                         ← RSC — static home page
 ├── not-found.tsx                    ← Custom 404 page
 ├── value-estimator/
 │   ├── layout.tsx                   ← RSC — page-level metadata
 │   ├── loading.tsx                  ← Skeleton loading UI (Next.js layout-level)
 │   ├── error.tsx                    ← Error boundary
 │   ├── page.tsx                     ← "use client" — prediction form + result card
 │   ├── history/page.tsx             ← "use client" — sortable/filterable history table
 │   └── compare/page.tsx             ← "use client" — comparison chart + decision table
 └── market-analysis/
     ├── layout.tsx                   ← RSC — page-level metadata
     ├── loading.tsx                  ← Skeleton loading UI (Next.js layout-level)
     ├── error.tsx                    ← Error boundary
     ├── page.tsx                     ← RSC — parallel-fetches statistics + insights (ISR 10 min)
     ├── MarketDashboard.tsx          ← "use client" — receives server props, no initial fetch
     ├── analysis/page.tsx            ← "use client" — what-if sliders + sensitivity chart
     └── export/page.tsx              ← "use client" — CSV/PDF export with section picker
```

### Caching — Three Aligned Layers (all 10-minute TTL)

| Layer | Technology | What is cached |
|---|---|---|
| ML model metadata | asyncio `Lock` + `time.monotonic()` | Coefficients + training ranges, per-process in-memory |
| Market analytics | Caffeine (`maximumSize(1)`, `expireAfterWrite`) | `statistics`, `insights`, `modelCoefficients` named caches |
| Next.js ISR | `fetch` + `next: { revalidate: 600 }` | Pre-fetched server-side market data |

### Error Handling

| Layer | Mechanism |
|---|---|
| Java backend | `@RestControllerAdvice` → RFC 9457 `ProblemDetail` |
| Python backend | `@exception_handler(Exception)` → `{"detail": "..."}` JSON |
| Frontend | `error.tsx` error boundaries on both app routes |
| API client | `AbortSignal.timeout(15_000)` on every fetch; `parseApiError()` extracts RFC 9457 `detail` |

---

## Prerequisites

| Tool | Minimum Version |
|---|---|
| Python | 3.12 |
| Java | 21 |
| Maven | 3.9 |
| Node.js | 20 |
| npm | 10 |

---

## Local Setup

### 1 — Clone

```bash
git clone https://github.com/annamalai-pichaimuthu/house-prediction.git
cd house-prediction
```

### 2 — Environment files

```bash
cp ml-model/.env.local.example        ml-model/.env.local
cp backend-python/.env.local.example  backend-python/.env.local
cp backend-java/.env.local.example    backend-java/.env.local
cp frontend/.env.local.example        frontend/.env.local
```

> `.env.local` files are gitignored — never commit them.

---

### 3 — ML Model Service

```bash
cd ml-model
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Train first — generates app/model.joblib + app/model_meta.json
python train.py

uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Or with Docker Compose (nginx load balancer + 4 replicas):

```bash
cd ml-model
make compose-up
```

**Verify:**
```bash
curl http://localhost:8000/health
curl http://localhost:8000/model-info
```

---

### 4 — Python Backend

Requires ML Model to be running first.

```bash
cd backend-python
python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

**Verify:** http://localhost:8001/docs

---

### 5 — Java Backend

Requires ML Model to be running first.

```bash
cd backend-java
export ML_MODEL_URL=http://localhost:8000
./mvnw spring-boot:run

# Or build a JAR
./mvnw clean package
java -jar target/backend-java-1.0.0.jar
```

**Verify:**
```bash
curl http://localhost:9090/actuator/health
curl http://localhost:9090/api/market/statistics
```

Swagger UI: http://localhost:9090/swagger-ui.html

---

### 6 — Frontend

Requires both backends to be running.

```bash
cd frontend
npm install
npm run dev
```

Open: http://localhost:3000

---

## Running All Services Together

```bash
# Tab 1 — ML Model
cd ml-model && source venv/bin/activate
uvicorn app.main:app --port 8000 --reload

# Tab 2 — Python Backend
cd backend-python && source venv/bin/activate
uvicorn app.main:app --port 8001 --reload

# Tab 3 — Java Backend
cd backend-java
export ML_MODEL_URL=http://localhost:8000
./mvnw spring-boot:run

# Tab 4 — Frontend
cd frontend && npm run dev
```

Open http://localhost:3000.

---

## Environment Variables Reference

### `ml-model/.env.local`

| Variable | Default | Description |
|---|---|---|
| `ML_MODEL_PORT` | `8000` | Port the inference server listens on |
| `MODEL_PATH` | `app/model.joblib` | Path to the serialised sklearn pipeline |
| `META_PATH` | `app/model_meta.json` | Path to model metadata JSON |
| `INFERENCE_WORKERS` | `4` | ThreadPoolExecutor size for CPU-bound inference |
| `APP_ENV` | `development` | `development` / `production` |
| `LOG_LEVEL` | `INFO` | `DEBUG` / `INFO` / `WARNING` |

### `backend-python/.env.local`

| Variable | Default | Description |
|---|---|---|
| `BACKEND_PYTHON_PORT` | `8001` | Port this service listens on |
| `ML_MODEL_URL` | `http://localhost:8000` | Base URL of the ML model service |
| `DATABASE_URL` | `sqlite+aiosqlite:///./history.db` | SQLAlchemy async DB connection string |
| `APP_ENV` | `development` | `development` / `production` |
| `LOG_LEVEL` | `INFO` | Log level |

### `backend-java/.env.local`

| Variable | Default | Description |
|---|---|---|
| `BACKEND_JAVA_PORT` | `9090` | Port this service listens on |
| `ML_MODEL_URL` | `http://localhost:8000` | Base URL of the ML model service (what-if only) |
| `FRONTEND_URL` | `http://localhost:3000` | Frontend origin (used in OpenAPI metadata) |
| `CACHE_REFRESH_MS` | `600000` | Cache TTL in milliseconds (default 10 min) |
| `CACHE_INITIAL_DELAY_MS` | `30000` | Delay before first scheduled cache eviction (30 s) |
| `LOG_LEVEL` | `INFO` | Log level |

### `frontend/.env.local`

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_PYTHON_API_URL` | `http://localhost:8001` | Python backend base URL (browser-visible) |
| `NEXT_PUBLIC_JAVA_API_URL` | `http://localhost:9090` | Java backend base URL (browser-visible) |
| `JAVA_INTERNAL_URL` | *(same as above)* | Java backend URL for server-side RSC fetches — set to internal hostname in production |

> In production, `JAVA_INTERNAL_URL` lets the Next.js server fetch directly from the internal network without going through the public internet.

---

## API Reference

### ML Model — port 8000

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Liveness probe |
| `GET` | `/model-info` | Coefficients, training metrics, per-feature training ranges |
| `POST` | `/predict` | Single or batch inference (up to 10,000 records) |

### Python Backend — port 8001

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/predict` | Single prediction — returns price, per-feature contributions, confidence, suggestion |
| `POST` | `/predict/batch` | Batch prediction (not persisted to history) |
| `GET` | `/history` | All saved predictions, newest first |
| `DELETE` | `/history/{id}` | Delete one history record |
| `GET` | `/model-info` | Proxied model metadata |

### Java Backend — port 9090

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/market/properties` | All CSV rows as JSON (used by the property dataset modal) |
| `GET` | `/api/market/statistics` | Price KPIs, averages, training ranges, what-if slider bounds |
| `GET` | `/api/market/insights` | Segment charts, OLS price drivers, best-value property picks |
| `POST` | `/api/market/whatif` | Live what-if price prediction + market comparison + sensitivity |
| `POST` | `/api/market/cache/evict` | Clear all Caffeine caches (force reload from CSV + ML model) |
| `GET` | `/api/market/export/csv` | Download selected sections as CSV |
| `GET` | `/api/market/export/pdf` | Download selected sections as PDF report |
| `GET` | `/actuator/health` | Spring Boot health detail |

#### Export query parameters (both `csv` and `pdf`)

All default to `true` — set any to `false` to exclude that section:

| Parameter | Section included |
|---|---|
| `includeOverview` | Market KPI summary (prices, averages) |
| `includeSegments` | Average price by bedroom / school zone / location zone |
| `includeDrivers` | OLS price correlation per feature |
| `includeTopPicks` | Best space-for-money + best school zone properties |
| `includeListing` | Full property dataset (all CSV rows) |

---

## Project Structure

```
house-prediction/
├── ml-model/                            # FastAPI inference server + training script
│   ├── train.py                         # One-time training — run before first start
│   ├── app/
│   │   ├── main.py                      # FastAPI app: /predict /health /model-info
│   │   ├── schemas.py                   # Pydantic models + confidence scoring
│   │   ├── model.joblib                 # Trained pipeline (gitignored)
│   │   └── model_meta.json             # Metrics + coefficients + ranges (gitignored)
│   ├── Dockerfile
│   ├── docker-compose.yml               # API + nginx load balancer
│   └── requirements.txt
│
├── backend-python/                      # FastAPI prediction proxy + history store
│   ├── app/
│   │   ├── main.py                      # App factory, CORS, global exception handler
│   │   ├── config.py                    # pydantic-settings env config
│   │   ├── database.py                  # SQLAlchemy 2 async + SQLite
│   │   ├── schemas.py                   # Request/response Pydantic models
│   │   └── routers/
│   │       ├── predict.py               # POST /predict — clamping, contributions, suggestion
│   │       ├── history.py               # GET/DELETE /history
│   │       └── model_info.py            # GET /model-info proxy
│   ├── Dockerfile
│   └── requirements.txt
│
├── backend-java/                        # Spring Boot market analytics service
│   └── src/main/java/com/housing/
│       ├── controller/
│       │   ├── MarketController.java    # All /api/market/* REST endpoints
│       │   └── HealthController.java
│       ├── service/
│       │   ├── CsvDataService.java      # Loads CSV at startup into immutable list
│       │   ├── MarketService.java       # Statistics + insights + OLS from CSV rows
│       │   ├── MlModelClient.java       # HTTP client → ml-model (what-if + coefficients)
│       │   ├── ExportService.java       # CSV + PDF generation (iTextPDF 8)
│       │   └── CacheRefreshService.java # Scheduled Caffeine cache eviction
│       ├── config/
│       │   ├── CacheConfig.java         # Caffeine — 3 named caches, 10-min TTL
│       │   ├── CorsConfig.java
│       │   ├── GlobalExceptionHandler.java  # RFC 9457 ProblemDetail
│       │   ├── OpenApiConfig.java
│       │   ├── RestClientConfig.java
│       │   └── WhatIfRangesConfig.java  # What-if slider bounds from application.yml
│       └── model/dto/                   # Java records: all request/response shapes
│
├── frontend/                            # Next.js 16 App Router
│   ├── app/
│   │   ├── layout.tsx                   # Root layout — Navbar, skip-to-content
│   │   ├── page.tsx                     # Home page (RSC, static)
│   │   ├── not-found.tsx                # Custom 404 page
│   │   ├── globals.css                  # Tailwind + page transitions (View Transitions API)
│   │   ├── value-estimator/
│   │   │   ├── layout.tsx               # Page metadata (RSC)
│   │   │   ├── loading.tsx              # Skeleton UI — shown during route transitions
│   │   │   ├── error.tsx                # Error boundary
│   │   │   ├── page.tsx                 # Prediction form + result card
│   │   │   ├── history/page.tsx         # Sortable + filterable prediction history
│   │   │   └── compare/page.tsx         # Side-by-side comparison + charts
│   │   └── market-analysis/
│   │       ├── layout.tsx               # Page metadata (RSC)
│   │       ├── loading.tsx              # Skeleton UI — shown during route transitions
│   │       ├── error.tsx                # Error boundary
│   │       ├── page.tsx                 # RSC — parallel pre-fetch, ISR 10 min
│   │       ├── MarketDashboard.tsx      # Client component — hydrates from server props
│   │       ├── analysis/page.tsx        # What-if sliders + sensitivity chart
│   │       └── export/page.tsx          # CSV/PDF export with section picker
│   ├── components/
│   │   ├── shared/
│   │   │   ├── Button.tsx               # Variants + loading state
│   │   │   ├── Card.tsx                 # Card / CardHeader / CardBody
│   │   │   ├── Navbar.tsx               # Sticky nav, active state, aria-current
│   │   │   ├── PropertyTableModal.tsx   # Paginated + sortable + filterable dataset modal
│   │   │   └── Spinner.tsx
│   │   └── value-estimator/
│   │       ├── PredictionForm.tsx       # Zod + react-hook-form, full ARIA attributes
│   │       └── ResultCard.tsx           # Price + chart/table toggle + suggestion flow
│   ├── lib/
│   │   ├── api/
│   │   │   ├── java-client.ts           # Typed fetch client for Java backend
│   │   │   ├── python-client.ts         # Typed fetch client for Python backend
│   │   │   └── server-fetch.ts          # Server-side RSC fetch utilities (ISR)
│   │   ├── hooks/
│   │   │   ├── usePrediction.ts         # Prediction state + submit handler
│   │   │   ├── useHistory.ts            # History fetch + optimistic delete
│   │   │   └── useMarketData.ts         # useMarketInsights, useMarketStatistics, useWhatIf
│   │   └── utils.ts                     # formatCurrency, formatDate, parseApiError, cn
│   ├── store/
│   │   └── comparison.ts                # Zustand persist store — up to 4 comparison items
│   └── next.config.ts                   # API rewrites + security headers
│
├── ARCHITECTURE.md                      # Full technical reference
└── README.md                            # This file
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| ML | scikit-learn 1.5 · Ridge Regression · StandardScaler · joblib · numpy |
| ML API | FastAPI 0.115 · uvicorn · Pydantic v2 · asyncio + ThreadPoolExecutor · GZip middleware |
| Prediction Backend | FastAPI · SQLAlchemy 2 async · aiosqlite · httpx · pydantic-settings |
| Market Backend | Spring Boot 3.4 · Java 21 · Caffeine cache · Spring RestClient · iTextPDF 8 |
| Frontend Framework | Next.js 16 (App Router + RSC + ISR) · React 19 · TypeScript 5 |
| Frontend UI | Tailwind CSS 4 · Recharts · Lucide React · React Hook Form · Zod v4 · Zustand 5 |
| Frontend Infra | React Server Components · View Transitions API · Zustand persist · API proxy rewrites |

---

## Development Notes

- **Retrain the model** — run `python train.py` inside `ml-model/`, then restart both backends. All ranges and coefficients update automatically; no code changes required.
- **Java market analytics** — the dashboard computes statistics, segments, and OLS price drivers from `House_Price_Dataset.csv` loaded into memory at startup. The ML model is only called for the interactive what-if tool.
- **Cache refresh** — the "Refresh" button on the market analysis dashboard clears all Caffeine caches and reloads data. You can also call `POST /api/market/cache/evict` directly.
- **History database** — stored at `backend-python/history.db` (gitignored). Delete the file to reset all prediction history.
- **API proxy** — Next.js rewrites route all backend calls through the Next.js server, so ports 8001 and 9090 are never visible in the browser. In production, set `JAVA_INTERNAL_URL` to the internal service hostname for server-side fetches.
- **What-if slider bounds** — configured in `backend-java/src/main/resources/application.yml` under `what-if.ranges`. Edit there to adjust slider limits without touching Java code.
- **Swagger / OpenAPI** — Java: http://localhost:9090/swagger-ui.html · Python: http://localhost:8001/docs · ML model: http://localhost:8000/docs

---

## License

MIT
