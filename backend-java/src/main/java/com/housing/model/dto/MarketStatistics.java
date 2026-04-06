package com.housing.model.dto;

import java.util.List;
import java.util.Map;

/**
 * Full market statistics response for GET /api/market/statistics.
 *
 * trainingRanges : the ML model's training_ranges — [min, max] per feature.
 *                  Clients use these to build generic, data-driven UI (sliders, grids)
 *                  without ever reading or knowing the raw dataset.
 *
 * whatIfRanges   : realistic human exploration bounds for the what-if slider tool
 *                  (configured in application.yml, NOT training ranges).
 */
public record MarketStatistics(
        int totalProperties,
        PriceStats priceStats,
        StatRange squareFootageStats,
        StatRange yearBuiltStats,
        StatRange schoolRatingStats,
        Map<String, List<Double>> trainingRanges,
        Map<String, List<Double>> whatIfRanges
) {
    public record PriceStats(
            double min,
            double max,
            double average,
            double median
    ) {}
}
