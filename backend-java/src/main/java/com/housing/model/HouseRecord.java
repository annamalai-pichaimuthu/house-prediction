package com.housing.model;

/**
 * One row from House_Price_Dataset.csv.
 * All values are exactly as stored in the file — no normalisation.
 */
public record HouseRecord(
        int    id,
        double squareFootage,
        int    bedrooms,
        double bathrooms,
        int    yearBuilt,
        double lotSize,
        double distanceToCityCenter,
        double schoolRating,
        double price
) {}
