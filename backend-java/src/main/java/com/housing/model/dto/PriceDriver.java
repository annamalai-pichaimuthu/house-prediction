package com.housing.model.dto;

/**
 * One feature's influence on price — derived from ML model coefficients.
 * priceChangePerUnit: $ change in predicted price per one-unit increase in this feature.
 */
public record PriceDriver(
        String feature,            // camelCase key, e.g. "schoolRating"
        String label,              // human label, e.g. "School Rating"
        double priceChangePerUnit,
        String unit                // e.g. "per point", "per sq ft"
) {}
