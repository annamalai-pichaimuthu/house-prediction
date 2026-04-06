package com.housing.service;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.housing.model.dto.SensitivityEntry;
import com.housing.model.dto.WhatIfRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Thin client for the Python ML model service.
 *
 * Only two operations remain after the CSV refactor:
 *   - {@link #predict}          — single live prediction (what-if endpoint)
 *   - {@link #getCoefficients}  — model weights for the sensitivity table
 *
 * All statistics and segment insights are now derived from the CSV dataset
 * by {@link MarketService}, so the previous batchPredict / getModelInfo
 * hot-path calls have been removed.
 */
@Service
public class MlModelClient {

    private static final Logger log = LoggerFactory.getLogger(MlModelClient.class);
    private final RestClient restClient;

    public MlModelClient(RestClient mlModelRestClient) {
        this.restClient = mlModelRestClient;
    }

    // ── Internal DTOs ────────────────────────────────────────────────────────

    record MlFeatures(
            @JsonProperty("square_footage")          double squareFootage,
            int                                              bedrooms,
            double                                           bathrooms,
            @JsonProperty("year_built")              int    yearBuilt,
            @JsonProperty("lot_size")                double lotSize,
            @JsonProperty("distance_to_city_center") double distanceToCityCenter,
            @JsonProperty("school_rating")           double schoolRating
    ) {}

    record MlPredictRequest(Object features) {}

    record MlSinglePrediction(
            @JsonProperty("predicted_price") double predictedPrice
    ) {}

    record MlModelInfo(
            Map<String, Double> coefficients
    ) {}

    // ── Mapping tables ───────────────────────────────────────────────────────

    private static final Map<String, String> CAMEL_MAP = Map.of(
            "square_footage",          "squareFootage",
            "bedrooms",                "bedrooms",
            "bathrooms",               "bathrooms",
            "year_built",              "yearBuilt",
            "lot_size",                "lotSize",
            "distance_to_city_center", "distanceToCityCenter",
            "school_rating",           "schoolRating"
    );

    private static final Map<String, String> UNIT_MAP = Map.of(
            "square_footage",          "per sq ft",
            "bedrooms",                "per bedroom",
            "bathrooms",               "per bathroom",
            "year_built",              "per year",
            "lot_size",                "per sq ft",
            "distance_to_city_center", "per mile",
            "school_rating",           "per point"
    );

    // ── Public API ───────────────────────────────────────────────────────────

    /**
     * Fetches the ML model's feature coefficients (cached separately).
     * Used by the what-if sensitivity table and price-drivers insight.
     */
    @Cacheable("modelCoefficients")
    public Map<String, SensitivityEntry> getCoefficients() {
        try {
            MlModelInfo info = restClient.get()
                    .uri("/model-info")
                    .retrieve()
                    .body(MlModelInfo.class);
            if (info == null || info.coefficients() == null) return Map.of();

            Map<String, SensitivityEntry> result = new LinkedHashMap<>();
            info.coefficients().forEach((snakeKey, coeff) -> {
                String camel = CAMEL_MAP.getOrDefault(snakeKey, snakeKey);
                String unit  = UNIT_MAP.getOrDefault(snakeKey, "per unit");
                result.put(camel, new SensitivityEntry(
                        Math.round(coeff * 100.0) / 100.0, unit));
            });
            return result;
        } catch (RestClientException e) {
            log.warn("Could not fetch model coefficients: {}", e.getMessage());
            return Map.of();
        }
    }

    /**
     * Sends a single prediction request to the ML model.
     * Called only from the what-if endpoint — never from statistics/insights.
     */
    public double predict(WhatIfRequest req) {
        var body = new MlPredictRequest(toMlFeatures(req));
        try {
            var response = restClient.post()
                    .uri("/predict")
                    .body(body)
                    .retrieve()
                    .body(MlSinglePrediction.class);
            return response != null ? response.predictedPrice() : 0.0;
        } catch (RestClientException e) {
            log.error("ML model predict call failed: {}", e.getMessage());
            throw new RuntimeException("ML model unavailable: " + e.getMessage(), e);
        }
    }

    /** Quick health probe — used by HealthController. */
    public boolean isHealthy() {
        try {
            restClient.get().uri("/health").retrieve().toBodilessEntity();
            return true;
        } catch (RestClientException e) {
            log.warn("ML model health check failed: {}", e.getMessage());
            return false;
        }
    }

    // ── Helper ───────────────────────────────────────────────────────────────

    private MlFeatures toMlFeatures(WhatIfRequest req) {
        return new MlFeatures(
                req.squareFootage(), req.bedrooms(), req.bathrooms(),
                req.yearBuilt(), req.lotSize(), req.distanceToCityCenter(),
                req.schoolRating());
    }
}
