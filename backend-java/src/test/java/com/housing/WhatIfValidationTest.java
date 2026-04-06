package com.housing;

import com.housing.model.dto.WhatIfRequest;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pure unit tests for WhatIfRequest Bean Validation constraints.
 *
 * No Spring context — uses the Jakarta Validation API directly.
 * Fast: ~50 ms total.
 */
@DisplayName("WhatIfRequest validation")
class WhatIfValidationTest {

    private static Validator validator;

    @BeforeAll
    static void setup() {
        ValidatorFactory factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    // ── Helper ────────────────────────────────────────────────────────────────

    private WhatIfRequest valid() {
        return new WhatIfRequest(2000.0, 3, 2.0, 2010, 6000.0, 5.0, 7.5);
    }

    private Set<ConstraintViolation<WhatIfRequest>> validate(WhatIfRequest r) {
        return validator.validate(r);
    }

    // ── Valid input ───────────────────────────────────────────────────────────

    @Test
    @DisplayName("valid request produces no violations")
    void validRequest_noViolations() {
        assertThat(validate(valid())).isEmpty();
    }

    // ── squareFootage ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("squareFootage = null → violation")
    void squareFootage_null() {
        var r = new WhatIfRequest(null, 3, 2.0, 2010, 6000.0, 5.0, 7.5);
        assertThat(validate(r)).isNotEmpty();
    }

    @ParameterizedTest(name = "squareFootage = {0} → violation")
    @CsvSource({"0.0", "-1.0", "-500.0"})
    @DisplayName("squareFootage zero or negative → violation")
    void squareFootage_notPositive(double value) {
        var r = new WhatIfRequest(value, 3, 2.0, 2010, 6000.0, 5.0, 7.5);
        assertThat(validate(r)).isNotEmpty();
    }

    @Test
    @DisplayName("squareFootage = 0.001 (positive) → no violation")
    void squareFootage_smallPositive() {
        var r = new WhatIfRequest(0.001, 3, 2.0, 2010, 6000.0, 5.0, 7.5);
        assertThat(validate(r)).isEmpty();
    }

    // ── bedrooms ──────────────────────────────────────────────────────────────

    @Test
    @DisplayName("bedrooms = 0 → violation")
    void bedrooms_zero() {
        var r = new WhatIfRequest(2000.0, 0, 2.0, 2010, 6000.0, 5.0, 7.5);
        assertThat(validate(r)).isNotEmpty();
    }

    @Test
    @DisplayName("bedrooms = 21 → violation (max 20)")
    void bedrooms_aboveMax() {
        var r = new WhatIfRequest(2000.0, 21, 2.0, 2010, 6000.0, 5.0, 7.5);
        assertThat(validate(r)).isNotEmpty();
    }

    @Test
    @DisplayName("bedrooms = 1 → no violation (min boundary)")
    void bedrooms_minBoundary() {
        var r = new WhatIfRequest(2000.0, 1, 2.0, 2010, 6000.0, 5.0, 7.5);
        assertThat(validate(r)).isEmpty();
    }

    @Test
    @DisplayName("bedrooms = 20 → no violation (max boundary)")
    void bedrooms_maxBoundary() {
        var r = new WhatIfRequest(2000.0, 20, 2.0, 2010, 6000.0, 5.0, 7.5);
        assertThat(validate(r)).isEmpty();
    }

    // ── bathrooms ─────────────────────────────────────────────────────────────

    @Test
    @DisplayName("bathrooms = 0.4 → violation (min 0.5)")
    void bathrooms_belowMin() {
        var r = new WhatIfRequest(2000.0, 3, 0.4, 2010, 6000.0, 5.0, 7.5);
        assertThat(validate(r)).isNotEmpty();
    }

    @Test
    @DisplayName("bathrooms = 20.1 → violation (max 20.0)")
    void bathrooms_aboveMax() {
        var r = new WhatIfRequest(2000.0, 3, 20.1, 2010, 6000.0, 5.0, 7.5);
        assertThat(validate(r)).isNotEmpty();
    }

    @Test
    @DisplayName("bathrooms = 0.5 → no violation (min boundary)")
    void bathrooms_minBoundary() {
        var r = new WhatIfRequest(2000.0, 3, 0.5, 2010, 6000.0, 5.0, 7.5);
        assertThat(validate(r)).isEmpty();
    }

    // ── yearBuilt ─────────────────────────────────────────────────────────────

    @Test
    @DisplayName("yearBuilt = 1799 → violation (min 1800)")
    void yearBuilt_belowMin() {
        var r = new WhatIfRequest(2000.0, 3, 2.0, 1799, 6000.0, 5.0, 7.5);
        assertThat(validate(r)).isNotEmpty();
    }

    @Test
    @DisplayName("yearBuilt = 1800 → no violation (min boundary)")
    void yearBuilt_minBoundary() {
        var r = new WhatIfRequest(2000.0, 3, 2.0, 1800, 6000.0, 5.0, 7.5);
        assertThat(validate(r)).isEmpty();
    }

    // ── lotSize ───────────────────────────────────────────────────────────────

    @Test
    @DisplayName("lotSize = null → violation")
    void lotSize_null() {
        var r = new WhatIfRequest(2000.0, 3, 2.0, 2010, null, 5.0, 7.5);
        assertThat(validate(r)).isNotEmpty();
    }

    @Test
    @DisplayName("lotSize = 0 → violation")
    void lotSize_zero() {
        var r = new WhatIfRequest(2000.0, 3, 2.0, 2010, 0.0, 5.0, 7.5);
        assertThat(validate(r)).isNotEmpty();
    }

    // ── distanceToCityCenter ──────────────────────────────────────────────────

    @Test
    @DisplayName("distanceToCityCenter = -1.0 → violation")
    void distance_negative() {
        var r = new WhatIfRequest(2000.0, 3, 2.0, 2010, 6000.0, -1.0, 7.5);
        assertThat(validate(r)).isNotEmpty();
    }

    @Test
    @DisplayName("distanceToCityCenter = 0.0 → no violation (zero allowed)")
    void distance_zero_allowed() {
        var r = new WhatIfRequest(2000.0, 3, 2.0, 2010, 6000.0, 0.0, 7.5);
        assertThat(validate(r)).isEmpty();
    }

    // ── schoolRating ──────────────────────────────────────────────────────────

    @Test
    @DisplayName("schoolRating = -0.1 → violation")
    void schoolRating_negative() {
        var r = new WhatIfRequest(2000.0, 3, 2.0, 2010, 6000.0, 5.0, -0.1);
        assertThat(validate(r)).isNotEmpty();
    }

    @Test
    @DisplayName("schoolRating = 10.1 → violation")
    void schoolRating_aboveMax() {
        var r = new WhatIfRequest(2000.0, 3, 2.0, 2010, 6000.0, 5.0, 10.1);
        assertThat(validate(r)).isNotEmpty();
    }

    @Test
    @DisplayName("schoolRating = 0.0 → no violation (min boundary)")
    void schoolRating_minBoundary() {
        var r = new WhatIfRequest(2000.0, 3, 2.0, 2010, 6000.0, 5.0, 0.0);
        assertThat(validate(r)).isEmpty();
    }

    @Test
    @DisplayName("schoolRating = 10.0 → no violation (max boundary)")
    void schoolRating_maxBoundary() {
        var r = new WhatIfRequest(2000.0, 3, 2.0, 2010, 6000.0, 5.0, 10.0);
        assertThat(validate(r)).isEmpty();
    }

    // ── Multiple violations ───────────────────────────────────────────────────

    @Test
    @DisplayName("multiple invalid fields → multiple violations")
    void multipleViolations() {
        var r = new WhatIfRequest(-1.0, 0, 0.4, 1799, -1.0, -1.0, 11.0);
        assertThat(validate(r).size()).isGreaterThanOrEqualTo(6);
    }
}
