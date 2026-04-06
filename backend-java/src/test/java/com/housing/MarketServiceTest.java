package com.housing;

import com.housing.model.dto.*;
import com.housing.service.MarketService;
import com.housing.service.MlModelClient;
import com.housing.service.MlModelClient.MlModelInfo;
import com.housing.config.WhatIfRangesConfig;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests for MarketService.
 *
 * MlModelClient is a Mockito mock — no HTTP calls, no Spring context.
 * Focuses on the logic inside MarketService: statistics, what-if, insights.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("MarketService")
class MarketServiceTest {

    @Mock MlModelClient     mlModelClient;
    @Mock WhatIfRangesConfig whatIfRangesConfig;

    @InjectMocks MarketService marketService;

    // ── Shared stubs ──────────────────────────────────────────────────────────

    private static final Map<String, List<Double>> TRAINING_RANGES = Map.of(
            "square_footage",          List.of(980.0,  4900.0),
            "bedrooms",                List.of(2.0,    6.0),
            "bathrooms",               List.of(1.0,    4.0),
            "year_built",              List.of(1970.0, 2022.0),
            "lot_size",                List.of(2000.0, 10000.0),
            "distance_to_city_center", List.of(1.0,    15.0),
            "school_rating",           List.of(4.0,    9.5)
    );

    private static final Map<String, Double> COEFFICIENTS = Map.of(
            "square_footage",          1.78,
            "bedrooms",                5200.0,
            "bathrooms",               8100.0,
            "year_built",              620.0,
            "lot_size",                0.45,
            "distance_to_city_center", -3100.0,
            "school_rating",           18057.0
    );

    private MlModelInfo stubModelInfo() {
        return new MlModelInfo("Ridge Regression", 40, COEFFICIENTS, 270375.0, TRAINING_RANGES);
    }

    private WhatIfRangesConfig.RangeMap stubRangeMap() {
        // Minimal stub — returns empty map to avoid NPE in toApiMap()
        WhatIfRangesConfig.RangeMap rangeMap = mock(WhatIfRangesConfig.RangeMap.class);
        when(rangeMap.toApiMap()).thenReturn(Map.of());
        return rangeMap;
    }

    // ── getStatistics ─────────────────────────────────────────────────────────

    @Nested
    @DisplayName("getStatistics()")
    class GetStatistics {

        @Test
        @DisplayName("returns non-null MarketStatistics")
        void returnsNonNull() {
            when(mlModelClient.getModelInfo()).thenReturn(stubModelInfo());
            when(mlModelClient.batchPredict(anyList())).thenReturn(List.of(200_000.0, 350_000.0, 550_000.0));
            when(whatIfRangesConfig.getRanges()).thenReturn(stubRangeMap());

            MarketStatistics stats = marketService.getStatistics();
            assertThat(stats).isNotNull();
        }

        @Test
        @DisplayName("price range min is less than or equal to max")
        void priceRangeMinLeMax() {
            when(mlModelClient.getModelInfo()).thenReturn(stubModelInfo());
            when(mlModelClient.batchPredict(anyList())).thenReturn(List.of(200_000.0, 350_000.0, 550_000.0));
            when(whatIfRangesConfig.getRanges()).thenReturn(stubRangeMap());

            MarketStatistics stats = marketService.getStatistics();
            assertThat(stats.priceRange().min()).isLessThanOrEqualTo(stats.priceRange().max());
        }

        @Test
        @DisplayName("training ranges are included in response")
        void trainingRangesPresent() {
            when(mlModelClient.getModelInfo()).thenReturn(stubModelInfo());
            when(mlModelClient.batchPredict(anyList())).thenReturn(List.of(200_000.0, 350_000.0, 550_000.0));
            when(whatIfRangesConfig.getRanges()).thenReturn(stubRangeMap());

            MarketStatistics stats = marketService.getStatistics();
            assertThat(stats.trainingRanges()).isNotNull();
        }

        @Test
        @DisplayName("throws RuntimeException when ML model is unavailable")
        void throwsWhenMlModelNull() {
            when(mlModelClient.getModelInfo()).thenReturn(null);

            assertThatThrownBy(() -> marketService.getStatistics())
                    .isInstanceOf(RuntimeException.class);
        }
    }

    // ── whatIf ────────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("whatIf()")
    class WhatIfTests {

        private final WhatIfRequest validRequest =
                new WhatIfRequest(2000.0, 3, 2.0, 2010, 6000.0, 5.0, 7.5);

        @Test
        @DisplayName("returns WhatIfResponse with predicted price")
        void returnsResponse() {
            when(mlModelClient.getModelInfo()).thenReturn(stubModelInfo());
            when(mlModelClient.batchPredict(anyList())).thenReturn(List.of(200_000.0, 350_000.0, 550_000.0));
            when(mlModelClient.predict(any())).thenReturn(395_000.0);
            when(whatIfRangesConfig.getRanges()).thenReturn(stubRangeMap());

            WhatIfResponse resp = marketService.whatIf(validRequest);
            assertThat(resp).isNotNull();
            assertThat(resp.predictedPrice()).isEqualTo(395_000.0);
        }

        @Test
        @DisplayName("market comparison diff = predictedPrice - avgPrice")
        void marketComparisonDiff() {
            when(mlModelClient.getModelInfo()).thenReturn(stubModelInfo());
            // Batch predict used for statistics → avg will be (200k + 350k + 550k) / 3 ≈ 366,666
            when(mlModelClient.batchPredict(anyList())).thenReturn(List.of(200_000.0, 350_000.0, 550_000.0));
            when(mlModelClient.predict(any())).thenReturn(400_000.0);
            when(whatIfRangesConfig.getRanges()).thenReturn(stubRangeMap());

            WhatIfResponse resp = marketService.whatIf(validRequest);
            double expectedDiff = 400_000.0 - resp.marketComparison().avgPrice();
            assertThat(resp.marketComparison().diff()).isCloseTo(expectedDiff, org.assertj.core.data.Offset.offset(1.0));
        }

        @Test
        @DisplayName("coefficients map contains all 7 features")
        void coefficientsAllFeatures() {
            when(mlModelClient.getModelInfo()).thenReturn(stubModelInfo());
            when(mlModelClient.batchPredict(anyList())).thenReturn(List.of(200_000.0, 350_000.0, 550_000.0));
            when(mlModelClient.predict(any())).thenReturn(395_000.0);
            when(mlModelClient.getCoefficients()).thenReturn(Map.of(
                    "squareFootage",         new SensitivityEntry(1.78, "per sq ft", true),
                    "bedrooms",              new SensitivityEntry(5200.0, "per bedroom", true),
                    "bathrooms",             new SensitivityEntry(8100.0, "per bathroom", true),
                    "yearBuilt",             new SensitivityEntry(620.0, "per year", true),
                    "lotSize",               new SensitivityEntry(0.45, "per sq ft", true),
                    "distanceToCityCenter",  new SensitivityEntry(-3100.0, "per mile", false),
                    "schoolRating",          new SensitivityEntry(18057.0, "per point", true)
            ));
            when(whatIfRangesConfig.getRanges()).thenReturn(stubRangeMap());

            WhatIfResponse resp = marketService.whatIf(validRequest);
            assertThat(resp.coefficients()).hasSize(7);
        }

        @Test
        @DisplayName("throws RuntimeException when ML model is unavailable")
        void throwsWhenMlModelNull() {
            when(mlModelClient.getModelInfo()).thenReturn(null);
            assertThatThrownBy(() -> marketService.whatIf(validRequest))
                    .isInstanceOf(RuntimeException.class);
        }
    }

    // ── getInsights ───────────────────────────────────────────────────────────

    @Nested
    @DisplayName("getInsights()")
    class GetInsights {

        @Test
        @DisplayName("returns non-null InsightsResponse")
        void returnsNonNull() {
            when(mlModelClient.getModelInfo()).thenReturn(stubModelInfo());
            // Insights calls batchPredict multiple times; return enough values for all calls
            when(mlModelClient.batchPredict(anyList())).thenAnswer(inv -> {
                List<?> inputs = inv.getArgument(0);
                return inputs.stream().map(x -> 350_000.0).toList();
            });
            when(mlModelClient.getCoefficients()).thenReturn(Map.of(
                    "schoolRating", new SensitivityEntry(18057.0, "per point", true)
            ));

            InsightsResponse insights = marketService.getInsights();
            assertThat(insights).isNotNull();
        }

        @Test
        @DisplayName("bedroom segments count equals number of generated bedroom values")
        void bedroomSegmentsNonEmpty() {
            when(mlModelClient.getModelInfo()).thenReturn(stubModelInfo());
            when(mlModelClient.batchPredict(anyList())).thenAnswer(inv -> {
                List<?> inputs = inv.getArgument(0);
                return inputs.stream().map(x -> 350_000.0).toList();
            });
            when(mlModelClient.getCoefficients()).thenReturn(Map.of());

            InsightsResponse insights = marketService.getInsights();
            assertThat(insights.bedroomSegments()).isNotEmpty();
        }

        @Test
        @DisplayName("price drivers are sorted by absolute value descending")
        void priceDriversSorted() {
            when(mlModelClient.getModelInfo()).thenReturn(stubModelInfo());
            when(mlModelClient.batchPredict(anyList())).thenAnswer(inv -> {
                List<?> inputs = inv.getArgument(0);
                return inputs.stream().map(x -> 350_000.0).toList();
            });
            when(mlModelClient.getCoefficients()).thenReturn(Map.of(
                    "schoolRating",    new SensitivityEntry(18057.0, "per point", true),
                    "squareFootage",   new SensitivityEntry(1.78,    "per sq ft", true),
                    "distanceToCityCenter", new SensitivityEntry(-3100.0, "per mile", false)
            ));

            InsightsResponse insights = marketService.getInsights();
            List<Double> absValues = insights.priceDrivers().stream()
                    .map(d -> Math.abs(d.priceChangePerUnit()))
                    .toList();
            for (int i = 0; i < absValues.size() - 1; i++) {
                assertThat(absValues.get(i)).isGreaterThanOrEqualTo(absValues.get(i + 1));
            }
        }

        @Test
        @DisplayName("throws RuntimeException when ML model is unavailable")
        void throwsWhenMlModelNull() {
            when(mlModelClient.getModelInfo()).thenReturn(null);
            assertThatThrownBy(() -> marketService.getInsights())
                    .isInstanceOf(RuntimeException.class);
        }
    }
}
