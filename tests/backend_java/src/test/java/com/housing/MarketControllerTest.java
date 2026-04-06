package com.housing;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.housing.model.dto.*;
import com.housing.service.ExportService;
import com.housing.service.MarketService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.cache.CacheManager;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Map;

import static org.hamcrest.Matchers.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Slice tests for MarketController.
 *
 * Uses @WebMvcTest — starts the web layer only (no Spring Data, no cache scheduling).
 * MarketService and ExportService are replaced by Mockito mocks.
 */
@WebMvcTest(controllers = com.housing.controller.MarketController.class)
@DisplayName("MarketController")
class MarketControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;

    @MockBean MarketService  marketService;
    @MockBean ExportService  exportService;
    @MockBean CacheManager   cacheManager;

    // ── Stub builders ─────────────────────────────────────────────────────────

    private MarketStatistics stubStatistics() {
        return new MarketStatistics(
                new StatRange(200_000.0, 600_000.0, 350_000.0, 340_000.0),
                2500.0,
                7.2,
                Map.of("squareFootage", List.of(980.0, 4900.0)),
                Map.of("squareFootage", List.of(100.0, 20_000.0))
        );
    }

    private InsightsResponse stubInsights() {
        var segment   = new SegmentInsight("3 beds", 350_000.0, "bedrooms");
        var driver    = new PriceDriver("school_rating", "School Rating", 18_057.0, "per point", true);
        var valueSpot = new ValueSpot(2000.0, 3, 2.0, 2010, 6000.0, 5.0, 8.5, 350_000.0, 175.0, 2.4);
        return new InsightsResponse(
                List.of(segment), List.of(segment), List.of(segment),
                List.of(driver),
                List.of(valueSpot), List.of(valueSpot)
        );
    }

    private WhatIfResponse stubWhatIf(double price) {
        return new WhatIfResponse(
                price, "USD",
                new WhatIfRequest(2000.0, 3, 2.0, 2010, 6000.0, 5.0, 7.5),
                new WhatIfResponse.MarketComparison(350_000.0, price - 350_000.0,
                        (price - 350_000.0) / 350_000.0 * 100),
                Map.of("squareFootage",
                        new SensitivityEntry(1.78, "per sq ft", true))
        );
    }

    // ── GET /api/market/statistics ────────────────────────────────────────────

    @Nested
    @DisplayName("GET /api/market/statistics")
    class Statistics {

        @Test
        @DisplayName("returns 200 OK with statistics body")
        void returns200() throws Exception {
            when(marketService.getStatistics()).thenReturn(stubStatistics());

            mockMvc.perform(get("/api/market/statistics"))
                    .andExpect(status().isOk())
                    .andExpect(content().contentType(MediaType.APPLICATION_JSON))
                    .andExpect(jsonPath("$.priceRange").exists())
                    .andExpect(jsonPath("$.priceRange.min").value(200_000.0))
                    .andExpect(jsonPath("$.priceRange.max").value(600_000.0));
        }

        @Test
        @DisplayName("calls marketService.getStatistics() exactly once")
        void delegatesToService() throws Exception {
            when(marketService.getStatistics()).thenReturn(stubStatistics());
            mockMvc.perform(get("/api/market/statistics"));
            verify(marketService, times(1)).getStatistics();
        }

        @Test
        @DisplayName("returns 503 when service throws RuntimeException")
        void serviceErrorReturns503() throws Exception {
            when(marketService.getStatistics())
                    .thenThrow(new RuntimeException("ML model unavailable"));

            mockMvc.perform(get("/api/market/statistics"))
                    .andExpect(status().isServiceUnavailable());
        }
    }

    // ── GET /api/market/insights ──────────────────────────────────────────────

    @Nested
    @DisplayName("GET /api/market/insights")
    class Insights {

        @Test
        @DisplayName("returns 200 OK with insights body")
        void returns200() throws Exception {
            when(marketService.getInsights()).thenReturn(stubInsights());

            mockMvc.perform(get("/api/market/insights"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.bedroomSegments").isArray())
                    .andExpect(jsonPath("$.priceDrivers").isArray())
                    .andExpect(jsonPath("$.bestValueByPricePerSqFt").isArray());
        }

        @Test
        @DisplayName("calls marketService.getInsights() exactly once")
        void delegatesToService() throws Exception {
            when(marketService.getInsights()).thenReturn(stubInsights());
            mockMvc.perform(get("/api/market/insights"));
            verify(marketService, times(1)).getInsights();
        }

        @Test
        @DisplayName("returns 503 when service throws RuntimeException")
        void serviceErrorReturns503() throws Exception {
            when(marketService.getInsights())
                    .thenThrow(new RuntimeException("ML model unavailable"));

            mockMvc.perform(get("/api/market/insights"))
                    .andExpect(status().isServiceUnavailable());
        }
    }

    // ── POST /api/market/whatif ───────────────────────────────────────────────

    @Nested
    @DisplayName("POST /api/market/whatif")
    class WhatIf {

        private final String VALID_BODY = """
            {
              "squareFootage": 2000.0,
              "bedrooms": 3,
              "bathrooms": 2.0,
              "yearBuilt": 2010,
              "lotSize": 6000.0,
              "distanceToCityCenter": 5.0,
              "schoolRating": 7.5
            }
            """;

        @Test
        @DisplayName("returns 200 OK with valid body")
        void returns200() throws Exception {
            when(marketService.whatIf(any())).thenReturn(stubWhatIf(395_000.0));

            mockMvc.perform(post("/api/market/whatif")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(VALID_BODY))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.predictedPrice").value(395_000.0))
                    .andExpect(jsonPath("$.currency").value("USD"))
                    .andExpect(jsonPath("$.marketComparison").exists());
        }

        @Test
        @DisplayName("returns 400 when squareFootage is negative")
        void rejectsNegativeSquareFootage() throws Exception {
            String bad = VALID_BODY.replace("2000.0", "-1.0");
            mockMvc.perform(post("/api/market/whatif")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(bad))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("returns 400 when bedrooms exceeds max")
        void rejectsBedroomsAboveMax() throws Exception {
            String bad = VALID_BODY.replace("\"bedrooms\": 3", "\"bedrooms\": 25");
            mockMvc.perform(post("/api/market/whatif")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(bad))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("returns 400 when schoolRating exceeds 10")
        void rejectsSchoolRatingAbove10() throws Exception {
            String bad = VALID_BODY.replace("7.5", "11.0");
            mockMvc.perform(post("/api/market/whatif")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(bad))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("returns 400 when required field is missing")
        void rejectsMissingField() throws Exception {
            String missing = """
                {
                  "bedrooms": 3,
                  "bathrooms": 2.0,
                  "yearBuilt": 2010,
                  "lotSize": 6000.0,
                  "distanceToCityCenter": 5.0,
                  "schoolRating": 7.5
                }
                """;
            mockMvc.perform(post("/api/market/whatif")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(missing))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("returns 400 when body is empty")
        void rejectsEmptyBody() throws Exception {
            mockMvc.perform(post("/api/market/whatif")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{}"))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("returns 503 when service throws RuntimeException")
        void serviceErrorReturns503() throws Exception {
            when(marketService.whatIf(any()))
                    .thenThrow(new RuntimeException("ML model unavailable"));

            mockMvc.perform(post("/api/market/whatif")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(VALID_BODY))
                    .andExpect(status().isServiceUnavailable());
        }
    }

    // ── POST /api/market/cache/evict ──────────────────────────────────────────

    @Nested
    @DisplayName("POST /api/market/cache/evict")
    class CacheEvict {

        @Test
        @DisplayName("returns 204 No Content")
        void returns204() throws Exception {
            // cacheManager.getCache() returns null for unknown names in mock — that's fine
            mockMvc.perform(post("/api/market/cache/evict"))
                    .andExpect(status().isNoContent());
        }
    }
}
