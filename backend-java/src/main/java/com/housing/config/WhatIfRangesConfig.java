package com.housing.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.time.Year;
import java.util.List;
import java.util.Map;

@Component
@ConfigurationProperties(prefix = "what-if.ranges")
public class WhatIfRangesConfig {

    private Range squareFootage      = new Range(100,   20_000);
    private Range bedrooms           = new Range(1,     10);
    private Range bathrooms          = new Range(0.5,   10);
    private Range yearBuilt          = new Range(1800,  0);     // 0 = resolved to current year
    private Range lotSize            = new Range(500,   100_000);
    private Range distanceToCityCenter = new Range(0,   100);
    private Range schoolRating       = new Range(0,     10);

    // ── Getters / setters (required for Spring @ConfigurationProperties binding) ─

    public Range getSquareFootage()           { return squareFootage; }
    public void  setSquareFootage(Range r)    { this.squareFootage = r; }

    public Range getBedrooms()                { return bedrooms; }
    public void  setBedrooms(Range r)         { this.bedrooms = r; }

    public Range getBathrooms()               { return bathrooms; }
    public void  setBathrooms(Range r)        { this.bathrooms = r; }

    public Range getYearBuilt()               { return yearBuilt; }
    public void  setYearBuilt(Range r)        { this.yearBuilt = r; }

    public Range getLotSize()                 { return lotSize; }
    public void  setLotSize(Range r)          { this.lotSize = r; }

    public Range getDistanceToCityCenter()    { return distanceToCityCenter; }
    public void  setDistanceToCityCenter(Range r) { this.distanceToCityCenter = r; }

    public Range getSchoolRating()            { return schoolRating; }
    public void  setSchoolRating(Range r)     { this.schoolRating = r; }

    // ── Helpers ────────────────────────────────────────────────────────────────

    /**
     * Converts to a camelCase-keyed map suitable for the JSON API response.
     * yearBuilt.max of 0 is resolved to the current calendar year at call time.
     */
    public Map<String, List<Double>> toApiMap() {
        double yearMax = yearBuilt.max == 0
                ? Year.now().getValue()
                : yearBuilt.max;

        return Map.of(
                "squareFootage",        List.of(squareFootage.min,        squareFootage.max),
                "bedrooms",             List.of(bedrooms.min,             bedrooms.max),
                "bathrooms",            List.of(bathrooms.min,            bathrooms.max),
                "yearBuilt",            List.of(yearBuilt.min,            yearMax),
                "lotSize",              List.of(lotSize.min,              lotSize.max),
                "distanceToCityCenter", List.of(distanceToCityCenter.min, distanceToCityCenter.max),
                "schoolRating",         List.of(schoolRating.min,         schoolRating.max)
        );
    }

    // ── Inner type ─────────────────────────────────────────────────────────────

    public static class Range {
        private double min;
        private double max;

        public Range() {}
        public Range(double min, double max) { this.min = min; this.max = max; }

        public double getMin() { return min; }
        public void   setMin(double min) { this.min = min; }
        public double getMax() { return max; }
        public void   setMax(double max) { this.max = max; }
    }
}
