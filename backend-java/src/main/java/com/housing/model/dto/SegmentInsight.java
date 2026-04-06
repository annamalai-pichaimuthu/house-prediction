package com.housing.model.dto;

/**
 * Average price (and supporting stats) for one segment group —
 * e.g. "3 Bed", "High School (≥8)", "Suburban (3–6 mi)".
 */
public record SegmentInsight(
        String label,
        int    count,
        double averagePrice,
        double avgSqFt,
        double avgSchoolRating
) {}
