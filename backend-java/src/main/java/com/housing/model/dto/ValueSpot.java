package com.housing.model.dto;

/**
 * A property record enriched with value metrics:
 *  - pricePerSqFt   : price ÷ square footage  (lower = more space per dollar)
 *  - schoolPer100k  : school rating ÷ (price / 100 000)  (higher = better education per dollar)
 */
public record ValueSpot(
        int    squareFootage,
        int    bedrooms,
        double bathrooms,
        int    yearBuilt,
        double schoolRating,
        double distanceToCityCenter,
        double price,
        double pricePerSqFt,
        double schoolPer100k
) {}
