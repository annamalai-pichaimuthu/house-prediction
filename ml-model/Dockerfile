# ── Stage 1: Builder ──────────────────────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends gcc g++ \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy everything needed to train
COPY train.py .
COPY House_Price_Dataset.csv .
COPY app/ app/

# Run training — produces app/model.joblib and app/model_meta.json
RUN python train.py && ls -lh app/

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

WORKDIR /api

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && rm requirements.txt

# Copy app code
COPY app/ app/

# Copy trained artifacts from builder
COPY --from=builder /build/app/model.joblib   app/model.joblib
COPY --from=builder /build/app/model_meta.json app/model_meta.json

# Verify files are present before starting
RUN ls -lh app/ && python -c "import joblib; joblib.load('app/model.joblib'); print('model OK')"

RUN useradd -m -u 1000 apiuser
USER apiuser

EXPOSE 8000

CMD ["gunicorn", "app.main:app", \
     "-w", "4", \
     "-k", "uvicorn.workers.UvicornWorker", \
     "--bind", "0.0.0.0:8000", \
     "--timeout", "120", \
     "--access-logfile", "-", \
     "--error-logfile", "-"]