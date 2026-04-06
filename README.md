# HousingAI Portal

A full-stack residential property price prediction and market analytics platform built with four independent services.

| Service | Stack | Port |
|---|---|---|
| **ML Model** | Python · FastAPI · scikit-learn | `8000` |
| **Backend Python** | Python · FastAPI · SQLite | `8001` |
| **Backend Java** | Java 21 · Spring Boot 3.4 | `9090` |
| **Frontend** | Next.js 16 · TypeScript · Tailwind CSS | `3000` |

---

## Features

### Value Estimator
- Predict a property price from 7 input features (square footage, bedrooms, bathrooms, year built, lot size, distance to city centre, school rating)
- Per-feature dollar contribution breakdown ("what drives this price")
- Confidence indicator (high / medium / low) based on how far inputs are from training data
- Smart suggestion system — if inputs are out of range the app proposes adjusted values and an alternative price
- Full prediction history with sort, filter, and delete
- Side-by-side comparison of up to 4 saved predictions

### Market Analysis
- Market-wide price statistics (min / max / average) derived from model inference
- Segment charts — price by bedroom count, school tier, and location zone
- Price driver ranking — which features move the price most per unit
- Best-value search — top properties by price-per-sqft and school rating per $100k
- What-If explorer — adjust any feature via slider and instantly see the price delta vs market average
- Export market report as CSV or PDF

---

## Architecture

```
Browser
  │
  ├── /value-estimator  → backend-python (port 8001)  ──┐
  │                                                      ├── ml-model (port 8000)
  └── /market-analysis  → backend-java   (port 9090)  ──┘
```

- `ml-model` owns all inference — both backends call it, neither re-implements model logic
- `backend-python` persists prediction history to SQLite and computes feature contributions
- `backend-java` performs market analytics by batch-querying the model with synthetic inputs; no raw data stored
- `frontend` is Next.js App Router — pages are React Server Components by default, `"use client"` only where state is needed

For the full technical breakdown see [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## Prerequisites

| Tool | Version |
|---|---|
| Python | 3.12+ |
| Java | 21+ |
| Maven | 3.9+ |
| Node.js | 20+ |
| npm | 10+ |

---

## Local Setup

### 1 — Clone

```bash
git clone https://github.com/annamalai-pichaimuthu/house-prediction.git
cd house-prediction
```

### 2 — Environment files

Each service has its own env file. Copy the example and fill in any values you want to override (defaults work out of the box for local development):

```bash
# ML Model
cp ml-model/.env.local.example   ml-model/.env.local

# Python backend
cp backend-python/.env.local.example   backend-python/.env.local

# Java backend
cp backend-java/.env.local.example     backend-java/.env.local

# Frontend  (NEXT_PUBLIC_* vars — already has correct localhost defaults)
cp frontend/.env.local.example         frontend/.env.local
```

> `.env.local` files are gitignored. Never commit them.

---

### 3 — ML Model Service

```bash
cd ml-model

# Create and activate a virtual environment
python3.12 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Train the model (generates app/model.joblib + app/model_meta.json)
python train.py

# Start the inference server
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Or with Docker Compose (includes nginx load balancer):

```bash
cd ml-model
make compose-up     # builds + starts api + nginx
make compose-down   # stop
```

**Verify:**
```bash
curl http://localhost:8000/health
curl http://localhost:8000/model-info
```

---

### 4 — Python Backend

Requires the ML Model service to be running first.

```bash
cd backend-python

python3.12 -m venv venv
source venv/bin/activate

pip install -r requirements.txt

uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

**Verify:**
```bash
curl http://localhost:8001/model-info
```

Interactive API docs: http://localhost:8001/docs

---

### 5 — Java Backend

Requires the ML Model service to be running first.

```bash
cd backend-java

# Run (downloads dependencies automatically on first run)
./mvnw spring-boot:run

# Or build a JAR and run it
./mvnw clean package -DskipTests
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

Open four terminal tabs and run each service:

```bash
# Tab 1 — ML Model
cd ml-model && source venv/bin/activate && uvicorn app.main:app --port 8000 --reload

# Tab 2 — Python Backend
cd backend-python && source venv/bin/activate && uvicorn app.main:app --port 8001 --reload

# Tab 3 — Java Backend
cd backend-java && ./mvnw spring-boot:run

# Tab 4 — Frontend
cd frontend && npm run dev
```

Then open http://localhost:3000.

---

## Environment Variables Reference

### `ml-model/.env.local`

| Variable | Default | Description |
|---|---|---|
| `ML_MODEL_PORT` | `8000` | Port the inference server listens on |
| `MODEL_PATH` | `app/model.joblib` | Path to the serialised sklearn pipeline |
| `META_PATH` | `app/model_meta.json` | Path to model metadata JSON |
| `INFERENCE_WORKERS` | `4` | ThreadPoolExecutor size for CPU inference |
| `APP_ENV` | `development` | `development` / `production` |
| `LOG_LEVEL` | `INFO` | `DEBUG` / `INFO` / `WARNING` |

### `backend-python/.env.local`

| Variable | Default | Description |
|---|---|---|
| `BACKEND_PYTHON_PORT` | `8001` | Port this service listens on |
| `ML_MODEL_URL` | `http://localhost:8000` | Base URL of the ML model service |
| `DATABASE_URL` | `sqlite+aiosqlite:///./history.db` | SQLAlchemy async DB URL |
| `APP_ENV` | `development` | `development` / `production` |
| `LOG_LEVEL` | `INFO` | Log level |

### `backend-java/.env.local`

| Variable | Default | Description |
|---|---|---|
| `BACKEND_JAVA_PORT` | `9090` | Port this service listens on |
| `ML_MODEL_URL` | `http://localhost:8000` | Base URL of the ML model service |
| `FRONTEND_URL` | `http://localhost:3000` | Frontend origin (used in OpenAPI metadata) |
| `CACHE_REFRESH_MS` | `600000` | Cache eviction interval in ms (default 10 min) |
| `CACHE_INITIAL_DELAY_MS` | `30000` | Initial delay before first eviction (30 s) |
| `LOG_LEVEL` | `INFO` | Log level |

### `frontend/.env.local`

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_PYTHON_API_URL` | `http://localhost:8001` | Python backend base URL (browser-visible) |
| `NEXT_PUBLIC_JAVA_API_URL` | `http://localhost:9090` | Java backend base URL (browser-visible) |

> `NEXT_PUBLIC_` prefix is required by Next.js for variables accessed in client components.

---

## API Overview

### ML Model (port 8000)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Liveness probe |
| `GET` | `/model-info` | Coefficients, metrics, training ranges |
| `POST` | `/predict` | Single or batch inference (up to 10,000 records) |

### Python Backend (port 8001)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/predict` | Single prediction + contributions + suggestion |
| `POST` | `/predict/batch` | Batch prediction (not persisted to history) |
| `GET` | `/history` | All predictions, newest first |
| `DELETE` | `/history/{id}` | Delete a history record |
| `GET` | `/model-info` | Proxied model metadata |

### Java Backend (port 9090)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/market/statistics` | Price KPIs, training ranges, what-if ranges |
| `GET` | `/api/market/insights` | Segment charts, drivers, best-value picks |
| `POST` | `/api/market/whatif` | What-if price + market comparison |
| `GET` | `/api/market/export/csv` | Download market report as CSV |
| `GET` | `/api/market/export/pdf` | Download market report as PDF |
| `GET` | `/actuator/health` | Spring health detail |

---

## Project Structure

```
house-prediction/
├── ml-model/               # FastAPI inference server + training script
│   ├── train.py            # One-time training (run before starting service)
│   ├── app/
│   │   ├── main.py         # FastAPI app, lifespan, endpoints
│   │   ├── schemas.py      # Pydantic models, confidence scoring
│   │   ├── model.joblib    # Trained pipeline (gitignored, generated by train.py)
│   │   └── model_meta.json # Metrics + coefficients + ranges (gitignored)
│   ├── Dockerfile
│   ├── docker-compose.yml  # API + nginx load balancer
│   └── requirements.txt
│
├── backend-python/         # FastAPI prediction proxy + history
│   ├── app/
│   │   ├── main.py         # App factory, CORS, lifespan
│   │   ├── config.py       # pydantic-settings env config
│   │   ├── database.py     # SQLAlchemy async ORM + SQLite
│   │   ├── schemas.py      # Request/response Pydantic models
│   │   └── routers/
│   │       ├── predict.py  # POST /predict — clamping, contributions, suggestion
│   │       ├── history.py  # GET/DELETE /history
│   │       └── model_info.py
│   ├── Dockerfile
│   └── requirements.txt
│
├── backend-java/           # Spring Boot market analytics
│   └── src/main/java/com/housing/
│       ├── controller/     # MarketController — all /api/market/* endpoints
│       ├── service/        # MarketService, MlModelClient, ExportService, CacheRefreshService
│       ├── config/         # CacheConfig, CorsConfig, WhatIfRangesConfig, GlobalExceptionHandler
│       └── model/dto/      # Java records for all request/response shapes
│
├── frontend/               # Next.js 16 App Router
│   ├── app/
│   │   ├── page.tsx                      # Homepage (RSC)
│   │   ├── value-estimator/              # Prediction, history, compare
│   │   └── market-analysis/              # Dashboard, analysis, export
│   ├── components/
│   │   ├── shared/                       # Button, Card, Navbar, Spinner
│   │   └── value-estimator/             # PredictionForm, ResultCard
│   ├── lib/
│   │   ├── api/                          # python-client.ts, java-client.ts
│   │   └── hooks/                        # usePrediction, useHistory, useMarketData
│   └── store/
│       └── comparison.ts                 # Zustand store (persisted to localStorage)
│
├── ARCHITECTURE.md         # Full technical reference
├── README.md               # This file
├── .env.example            # Navigation guide to per-service env files
└── .gitignore
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| ML | scikit-learn 1.5 · Ridge Regression · StandardScaler · joblib |
| Inference API | FastAPI 0.115 · uvicorn · Pydantic v2 · asyncio + ThreadPoolExecutor |
| Prediction Backend | FastAPI · SQLAlchemy 2.x async · aiosqlite · httpx · pydantic-settings |
| Market Backend | Spring Boot 3.4 · Java 21 · Caffeine cache · Spring RestClient · iTextPDF |
| Frontend | Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 |
| UI Components | Recharts · Lucide React · React Hook Form · Zod v4 · Zustand 5 |

---

## Development Notes

- **Retrain the model** — run `python train.py` inside `ml-model/` then restart both backends. All ranges and coefficients update automatically; no code changes required.
- **History database** — stored at `backend-python/history.db` (gitignored). Delete the file to reset history.
- **Java cache** — market insights are cached for 10 minutes by default. Set `CACHE_REFRESH_MS=0` is not supported; use a small value like `10000` for faster refresh during development.
- **Swagger / OpenAPI** — Java backend exposes full OpenAPI spec at http://localhost:9090/api-docs and Swagger UI at http://localhost:9090/swagger-ui.html. Python backends expose docs at `/docs`.

---

## License

MIT
