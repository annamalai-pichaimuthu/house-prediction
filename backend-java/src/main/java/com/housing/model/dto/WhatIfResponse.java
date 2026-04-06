package com.housing.model.dto;

import java.util.Map;

/**
 * Response for POST /api/market/whatif.
 */
public record WhatIfResponse(
        double predictedPrice,
        String currency,
        WhatIfRequest inputs,
        MarketComparison marketComparison,
        Map<String, SensitivityEntry> sensitivityAnalysis
) {
    public record MarketComparison(
            double averagePrice,
            double differenceFromAverage,
            double percentAboveAverage
    ) {}
}
