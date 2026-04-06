# API Unit Tests

Centralised test suite for all three backend services.

```
tests/
├── ml_model/           # FastAPI inference service (port 8000)
│   ├── conftest.py
│   ├── test_health.py
│   ├── test_model_info.py
│   ├── test_predict.py
│   └── test_schemas.py
├── backend_python/     # FastAPI prediction proxy (port 8001)
│   ├── conftest.py
│   ├── test_predict.py
│   ├── test_history.py
│   └── test_model_info_proxy.py
├── backend_java/       # Spring Boot market analytics (port 9090)
│   └── src/test/java/com/housing/
│       ├── MarketControllerTest.java
│       ├── WhatIfValidationTest.java
│       └── MarketServiceTest.java
└── requirements-test.txt
```

## Running Python Tests

```bash
# From the repo root
pip install -r tests/requirements-test.txt

# ML model tests (starts an in-process TestClient — no running server needed)
pytest tests/ml_model/ -v

# Python backend tests
pytest tests/backend_python/ -v

# All Python tests
pytest tests/ -v --ignore=tests/backend_java
```

## Running Java Tests

```bash
cd backend-java
./mvnw test
```

Or run only the market tests:
```bash
./mvnw test -Dtest="MarketControllerTest,WhatIfValidationTest,MarketServiceTest"
```
