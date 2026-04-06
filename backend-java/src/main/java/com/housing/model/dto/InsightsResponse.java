package com.housing.model.dto;

import java.util.List;

/**
 * Full insights payload for GET /api/market/insights.
 * All fields are pre-computed from the static dataset + ML model coefficients.
 */
public record InsightsResponse(
        List<SegmentInsight> byBedrooms,       // avg price per bedroom count
        List<SegmentInsight> bySchoolTier,     // avg price: Low / Mid / High school rating
        List<SegmentInsight> byLocationZone,   // avg price: Urban / Suburban / Outer
        List<PriceDriver>    priceDrivers,     // feature coefficients, sorted by |impact|
        List<ValueSpot>      bestByPrice,      // top 8 cheapest per sq ft
        List<ValueSpot>      bestBySchool      // top 8 best school rating per $100k
) {}
