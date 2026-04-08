"""
load_test.py
------------
Pure load and performance test for the Housing Price Prediction API.
No business logic or scenario validation — just throughput, latency, and reliability.

Tests:
  1. Health check reachability
  2. Sequential latency (50 requests)
  3. Concurrent stress test (20 users x 5 requests)
  4. Large batch stress test (500 & 1000 records)
  5. Sustained load (200 requests over 30 seconds)

Usage:
    pip install requests
    python load_test.py

    # Custom host/port:
    API_URL=http://localhost:8080 python load_test.py
"""

import logging
import os
import sys
import time
import statistics
import concurrent.futures

import requests

# ── Logging Configuration ────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Config
API_URL            = os.environ.get("API_URL", "http://127.0.0.1:8000")
CONCURRENT_USERS   = 20
REQUESTS_PER_USER  = 5
SUSTAINED_REQUESTS = 200
SUSTAINED_DURATION = 30
TIMEOUT            = 15

TEST_HOUSES = [
    {"square_footage": 1550, "bedrooms": 3, "bathrooms": 2.0, "year_built": 1997, "lot_size": 6800, "distance_to_city_center": 4.1, "school_rating": 7.6},
    {"square_footage": 2200, "bedrooms": 4, "bathrooms": 2.5, "year_built": 2008, "lot_size": 9600, "distance_to_city_center": 7.0, "school_rating": 8.8},
    {"square_footage": 1180, "bedrooms": 2, "bathrooms": 1.0, "year_built": 1982, "lot_size": 5100, "distance_to_city_center": 2.5, "school_rating": 6.7},
    {"square_footage": 1870, "bedrooms": 3, "bathrooms": 2.5, "year_built": 2001, "lot_size": 7900, "distance_to_city_center": 5.5, "school_rating": 8.3},
    {"square_footage": 1430, "bedrooms": 3, "bathrooms": 1.5, "year_built": 1990, "lot_size": 6200, "distance_to_city_center": 3.3, "school_rating": 7.2},
    {"square_footage": 2300, "bedrooms": 4, "bathrooms": 3.0, "year_built": 2013, "lot_size": 10300, "distance_to_city_center": 8.0, "school_rating": 9.2},
    {"square_footage": 1650, "bedrooms": 3, "bathrooms": 2.0, "year_built": 1999, "lot_size": 7100, "distance_to_city_center": 4.2, "school_rating": 7.8},
    {"square_footage": 1020, "bedrooms": 2, "bathrooms": 1.0, "year_built": 1979, "lot_size": 4400, "distance_to_city_center": 2.0, "school_rating": 6.5},
    {"square_footage": 2100, "bedrooms": 4, "bathrooms": 2.5, "year_built": 2005, "lot_size": 9200, "distance_to_city_center": 6.8, "school_rating": 8.6},
    {"square_footage": 1350, "bedrooms": 3, "bathrooms": 1.0, "year_built": 1988, "lot_size": 5700, "distance_to_city_center": 3.1, "school_rating": 7.0},
]


class Colors:
    GREEN  = "\033[92m"
    RED    = "\033[91m"
    CYAN   = "\033[96m"
    BOLD   = "\033[1m"
    YELLOW = "\033[93m"
    RESET  = "\033[0m"

results_summary = []

def header(title):
    print(f"\n{Colors.BOLD}{Colors.CYAN}{'─' * 60}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.CYAN}  {title}{Colors.RESET}")
    print(f"{Colors.BOLD}{Colors.CYAN}{'─' * 60}{Colors.RESET}")

def result(label, passed, detail=""):
    icon = f"{Colors.GREEN}PASS{Colors.RESET}" if passed else f"{Colors.RED}FAIL{Colors.RESET}"
    print(f"  [{icon}]  {label}")
    if detail:
        colour = Colors.RESET if passed else Colors.YELLOW
        print(f"           {colour}{detail}{Colors.RESET}")
    results_summary.append((label, passed))

def latency_table(latencies, label="Latency stats"):
    s = sorted(latencies)
    n = len(s)
    avg = statistics.mean(s)
    p95 = s[int(0.95 * n)]
    print(f"\n  {label} ({n} requests):")
    print(f"    Min : {min(s):>8.1f} ms")
    print(f"    P50 : {s[int(0.50*n)]:>8.1f} ms")
    print(f"    Avg : {avg:>8.1f} ms")
    print(f"    P95 : {p95:>8.1f} ms")
    print(f"    P99 : {s[min(int(0.99*n), n-1)]:>8.1f} ms")
    print(f"    Max : {max(s):>8.1f} ms")
    return avg, p95


# TEST 1: Reachability
def test_reachability():
    header("TEST 1 - Reachability")
    try:
        logger.info("Testing reachability to %s", API_URL)
        r = requests.get(f"{API_URL}/health", timeout=TIMEOUT)
        logger.debug("Health check response status: %d", r.status_code)
        result("API is reachable",  r.status_code == 200)
        result("Model is loaded",   r.json().get("model_loaded") is True)
        logger.info("Reachability test completed")
    except requests.exceptions.ConnectionError as e:
        logger.error("Connection error - Cannot connect to %s: %s", API_URL, str(e))
        result("API is reachable", False, f"Cannot connect to {API_URL} — is the container running?")
        sys.exit(1)
    except requests.exceptions.Timeout:
        logger.error("Timeout connecting to %s after %ds", API_URL, TIMEOUT)
        result("API is reachable", False, f"Request timeout after {TIMEOUT}s")
        sys.exit(1)
    except Exception as e:
        logger.exception("Unexpected error during reachability test: %s", str(e))
        result("API is reachable", False, str(e))
        sys.exit(1)


# TEST 2: Sequential Latency
def test_sequential_latency():
    header("TEST 2 - Sequential Latency (50 single predictions)")
    latencies, errors = [], 0
    payload = {"features": TEST_HOUSES[0]}
    
    logger.info("Starting sequential latency test with 50 requests")

    for i in range(50):
        start = time.perf_counter()
        try:
            r = requests.post(f"{API_URL}/predict", json=payload, timeout=TIMEOUT)
            if r.status_code != 200:
                logger.warning("Request %d returned non-200 status: %d", i+1, r.status_code)
                errors += 1
            else:
                logger.debug("Request %d completed successfully", i+1)
        except requests.exceptions.Timeout:
            logger.warning("Request %d timed out", i+1)
            errors += 1
        except Exception as e:
            logger.error("Request %d failed: %s", i+1, str(e))
            errors += 1
        latencies.append((time.perf_counter() - start) * 1000)

    avg, p95 = latency_table(latencies)
    print()
    result("Zero errors",          errors == 0,  f"{errors}/50 failed")
    result("Avg latency < 300ms",  avg < 300,    f"{avg:.1f}ms")
    result("P95 latency < 800ms",  p95 < 800,    f"{p95:.1f}ms")
    logger.info("Sequential latency test completed - errors: %d, avg: %.1fms", errors, avg)


# TEST 3: Concurrent Stress
def _fire(args):
    idx, house = args
    start = time.perf_counter()
    try:
        r = requests.post(f"{API_URL}/predict", json={"features": house}, timeout=TIMEOUT)
        success = r.status_code == 200
        latency = (time.perf_counter() - start) * 1000
        if not success:
            logger.debug("Request %d returned status %d (latency: %.1fms)", idx, r.status_code, latency)
        return success, latency
    except requests.exceptions.Timeout:
        logger.debug("Request %d timed out", idx)
        return False, (time.perf_counter() - start) * 1000
    except Exception as e:
        logger.debug("Request %d failed: %s", idx, str(e))
        return False, (time.perf_counter() - start) * 1000

def test_concurrent_stress():
    total = CONCURRENT_USERS * REQUESTS_PER_USER
    header(f"TEST 3 - Concurrent Stress ({CONCURRENT_USERS} users x {REQUESTS_PER_USER} requests = {total} total)")
    
    logger.info("Starting concurrent stress test: %d requests from %d concurrent users", total, CONCURRENT_USERS)

    args_list = [(i, TEST_HOUSES[i % len(TEST_HOUSES)]) for i in range(total)]
    successes, latencies = 0, []

    wall_start = time.perf_counter()
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=CONCURRENT_USERS) as ex:
            for ok, lat in ex.map(_fire, args_list):
                latencies.append(lat)
                if ok:
                    successes += 1
    except Exception as e:
        logger.exception("Error during concurrent stress test execution: %s", str(e))
        result("Concurrent stress test", False, str(e))
        return
    
    wall = time.perf_counter() - wall_start
    throughput = total / wall
    avg, p95 = latency_table(latencies)
    success_rate = successes / total * 100

    print(f"\n    Successes  : {successes}/{total}")
    print(f"    Wall time  : {wall:.2f}s")
    print(f"    Throughput : {throughput:.1f} req/sec")
    print()

    result(f"Success rate >= 99%",      success_rate >= 99,  f"{success_rate:.1f}%")
    result(f"Avg latency < 500ms",      avg < 500,           f"{avg:.1f}ms")
    result(f"P95 latency < 1000ms",     p95 < 1000,          f"{p95:.1f}ms")
    result(f"Throughput >= 10 req/sec", throughput >= 10,    f"{throughput:.1f} req/sec")
    
    logger.info("Concurrent stress test completed - successes: %d/%d (%.1f%%), throughput: %.1f req/sec", 
               successes, total, success_rate, throughput)


# TEST 4: Large Batch
def test_large_batch():
    header("TEST 4 - Large Batch (500 & 1000 records)")
    
    logger.info("Starting large batch test")

    for batch_size in [500, 1000]:
        logger.info("Testing batch size: %d", batch_size)
        batch = (TEST_HOUSES * (batch_size // len(TEST_HOUSES) + 1))[:batch_size]
        start = time.perf_counter()
        try:
            logger.debug("Sending %d records to /predict endpoint", batch_size)
            r = requests.post(f"{API_URL}/predict", json={"features": batch}, timeout=60)
            latency = (time.perf_counter() - start) * 1000
            preds = r.json().get("predictions", [])
            throughput = batch_size / (latency / 1000)

            print(f"\n  Batch size : {batch_size:,}")
            print(f"    Status   : HTTP {r.status_code}")
            print(f"    Returned : {len(preds):,} predictions")
            print(f"    Time     : {latency:.0f}ms")
            print(f"    Speed    : {throughput:,.0f} predictions/sec")
            print()

            result(f"Batch {batch_size:,} - HTTP 200",        r.status_code == 200, f"got {r.status_code}")
            result(f"Batch {batch_size:,} - Correct count",   len(preds) == batch_size, f"got {len(preds)}")
            result(f"Batch {batch_size:,} - Under 5 seconds", latency < 5000, f"{latency:.0f}ms")
            
            logger.info("Batch %d test completed - status: %d, count: %d, latency: %.0fms, throughput: %.0f pred/sec",
                       batch_size, r.status_code, len(preds), latency, throughput)
        except requests.exceptions.Timeout:
            logger.error("Batch %d test timed out after 60s", batch_size)
            result(f"Batch {batch_size:,}", False, "Request timeout (60s)")
        except Exception as e:
            logger.exception("Batch %d test failed: %s", batch_size, str(e))
            result(f"Batch {batch_size:,}", False, str(e))


# TEST 5: Sustained Load
def test_sustained_load():
    header(f"TEST 5 - Sustained Load ({SUSTAINED_REQUESTS} requests over {SUSTAINED_DURATION}s)")
    
    logger.info("Starting sustained load test: %d requests over %ds", SUSTAINED_REQUESTS, SUSTAINED_DURATION)

    payload = {"features": TEST_HOUSES[0]}
    latencies, errors = [], 0
    interval = SUSTAINED_DURATION / SUSTAINED_REQUESTS

    print(f"  Firing 1 request every {interval*1000:.0f}ms ...")
    logger.debug("Request interval: %.3fs", interval)
    wall_start = time.perf_counter()

    for i in range(SUSTAINED_REQUESTS):
        next_fire = wall_start + i * interval
        sleep_for = next_fire - time.perf_counter()
        if sleep_for > 0:
            time.sleep(sleep_for)
        start = time.perf_counter()
        try:
            r = requests.post(f"{API_URL}/predict", json=payload, timeout=TIMEOUT)
            if r.status_code != 200:
                logger.warning("Request %d returned status %d", i+1, r.status_code)
                errors += 1
            else:
                logger.debug("Request %d completed successfully", i+1)
        except requests.exceptions.Timeout:
            logger.warning("Request %d timed out", i+1)
            errors += 1
        except Exception as e:
            logger.error("Request %d failed: %s", i+1, str(e))
            errors += 1
        latencies.append((time.perf_counter() - start) * 1000)
        if (i + 1) % 50 == 0:
            print(f"    {i+1}/{SUSTAINED_REQUESTS} done ...")
            logger.debug("Progress: %d/%d requests completed", i+1, SUSTAINED_REQUESTS)

    wall = time.perf_counter() - wall_start
    avg, p95 = latency_table(latencies, "Sustained load latency")
    success_rate = (SUSTAINED_REQUESTS - errors) / SUSTAINED_REQUESTS * 100

    print(f"\n    Total time : {wall:.1f}s")
    print(f"    Errors     : {errors}/{SUSTAINED_REQUESTS}")
    print()

    result("Zero errors under sustained load", errors == 0,          f"{errors} errors")
    result("Avg latency stable < 300ms",       avg < 300,            f"{avg:.1f}ms")
    result("P95 latency stable < 800ms",       p95 < 800,            f"{p95:.1f}ms")
    result("100% success rate",                success_rate == 100,  f"{success_rate:.1f}%")
    
    logger.info("Sustained load test completed - errors: %d, success_rate: %.1f%%, avg_latency: %.1fms", 
               errors, success_rate, avg)


# Final Report
def print_report():
    print(f"\n{'=' * 60}")
    print(f"{Colors.BOLD}  LOAD TEST REPORT{Colors.RESET}")
    print(f"{'=' * 60}")

    passed = sum(1 for _, p in results_summary if p)
    failed = sum(1 for _, p in results_summary if not p)
    total  = len(results_summary)
    score  = passed / total * 100 if total else 0

    print(f"\n  Total checks : {total}")
    print(f"  {Colors.GREEN}Passed{Colors.RESET}       : {passed}")
    print(f"  {Colors.RED}Failed{Colors.RESET}       : {failed}")

    if failed:
        print(f"\n  {Colors.RED}{Colors.BOLD}Failed checks:{Colors.RESET}")
        for label, p in results_summary:
            if not p:
                print(f"    {Colors.RED}x  {label}{Colors.RESET}")

    colour = Colors.GREEN if failed == 0 else Colors.RED
    print(f"\n  {colour}{Colors.BOLD}Score: {passed}/{total} ({score:.1f}%){Colors.RESET}")
    print(f"{'=' * 60}\n")
    
    logger.info("Load test report - Total checks: %d, Passed: %d, Failed: %d, Score: %.1f%%", 
               total, passed, failed, score)
    
    return failed == 0


if __name__ == "__main__":
    try:
        logger.info("=" * 60)
        logger.info("Starting Housing Price API - Load Test")
        print(f"\n{Colors.BOLD}Housing Price API - Load Test{Colors.RESET}")
        print(f"Target : {Colors.CYAN}{API_URL}{Colors.RESET}")
        print(f"Time   : {time.strftime('%Y-%m-%d %H:%M:%S')}")
        
        logger.info("Test target: %s", API_URL)
        logger.info("Configuration - Concurrent users: %d, Requests per user: %d, Sustained requests: %d",
                   CONCURRENT_USERS, REQUESTS_PER_USER, SUSTAINED_REQUESTS)

        test_reachability()
        test_sequential_latency()
        test_concurrent_stress()
        test_large_batch()
        test_sustained_load()

        ok = print_report()
        logger.info("Load test finished - Overall result: %s", "PASSED" if ok else "FAILED")
        sys.exit(0 if ok else 1)
        
    except Exception as e:
        logger.exception("Fatal error during load test: %s", str(e))
        print(f"\n{Colors.RED}Fatal error: {str(e)}{Colors.RESET}")
        sys.exit(1)