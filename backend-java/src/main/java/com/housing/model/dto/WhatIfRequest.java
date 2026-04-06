package com.housing.model.dto;

import jakarta.validation.constraints.*;

/**
 * Request body for POST /api/market/whatif.
 * Mirrors the HouseFeatures schema from the ML model (Task 1).
 * Field names are camelCase here; the MlModelClient maps to snake_case internally.
 */
public record WhatIfRequest(
        @NotNull @Positive
        Double squareFootage,

        @NotNull @Min(1) @Max(20)
        Integer bedrooms,

        @NotNull @DecimalMin("0.5") @DecimalMax("20.0")
        Double bathrooms,

        @NotNull @Min(1800)          // lower bound aligns with WhatIfRangesConfig default; no @Max — upper bound is current year, enforced by config
        Integer yearBuilt,

        @NotNull @Positive
        Double lotSize,

        @NotNull @DecimalMin("0.0")
        Double distanceToCityCenter,

        @NotNull @DecimalMin("0.0") @DecimalMax("10.0")
        Double schoolRating
) {}
