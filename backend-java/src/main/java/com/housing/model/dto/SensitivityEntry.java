package com.housing.model.dto;

/**
 * One feature's sensitivity: how much the price changes per unit of that feature.
 */
public record SensitivityEntry(
        double priceChangePerUnit,
        String unit
) {}
