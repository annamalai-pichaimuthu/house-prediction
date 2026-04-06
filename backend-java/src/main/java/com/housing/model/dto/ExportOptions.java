package com.housing.model.dto;

/**
 * Which sections to include in a CSV or PDF export.
 * Every flag defaults to {@code true} so callers that omit a param get everything.
 */
public record ExportOptions(
        boolean includeOverview,
        boolean includeSegments,
        boolean includeDrivers,
        boolean includeTopPicks,
        boolean includeListing
) {
    /** All sections on — used when no query params are supplied. */
    public static ExportOptions all() {
        return new ExportOptions(true, true, true, true, true);
    }
}
