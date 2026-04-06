package com.housing.service;

import com.housing.config.WhatIfRangesConfig;
import com.housing.model.HouseRecord;
import com.housing.model.dto.*;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

/**
 * All market statistics and insights are computed directly from the
 * CSV dataset loaded by {@link CsvDataService}.
 *
 * The ML model is only called for the what-if endpoint (live prediction).
 * This makes the dashboard independent of ML model availability.
 */
@Service
public class MarketService {

    private final CsvDataService     csvDataService;
    private final MlModelClient      mlModelClient;
    private final WhatIfRangesConfig whatIfRangesConfig;

    public MarketService(CsvDataService csvDataService,
                         MlModelClient mlModelClient,
                         WhatIfRangesConfig whatIfRangesConfig) {
        this.csvDataService      = csvDataService;
        this.mlModelClient       = mlModelClient;
        this.whatIfRangesConfig  = whatIfRangesConfig;
    }

    // ── Statistics ───────────────────────────────────────────────────────────

    /**
     * Aggregate statistics computed from the raw CSV rows.
     * Result is cached; no ML model call required.
     */
    @Cacheable("statistics")
    public MarketStatistics getStatistics() {
        List<HouseRecord> rows = csvDataService.all();
        if (rows.isEmpty()) throw new RuntimeException("Dataset not loaded");

        DoubleSummaryStatistics priceStats  = rows.stream().mapToDouble(HouseRecord::price).summaryStatistics();
        DoubleSummaryStatistics sqftStats   = rows.stream().mapToDouble(HouseRecord::squareFootage).summaryStatistics();
        DoubleSummaryStatistics yearStats   = rows.stream().mapToDouble(HouseRecord::yearBuilt).summaryStatistics();
        DoubleSummaryStatistics schoolStats = rows.stream().mapToDouble(HouseRecord::schoolRating).summaryStatistics();

        double median = computeMedian(rows.stream().mapToDouble(HouseRecord::price).toArray());

        // Build training ranges from actual dataset min/max (keeps existing API contract)
        Map<String, List<Double>> trainingRanges = Map.of(
                "square_footage",          List.of(round2(rows.stream().mapToDouble(HouseRecord::squareFootage).min().orElse(0)),          round2(rows.stream().mapToDouble(HouseRecord::squareFootage).max().orElse(0))),
                "bedrooms",                List.of((double) rows.stream().mapToInt(HouseRecord::bedrooms).min().orElse(0),                  (double) rows.stream().mapToInt(HouseRecord::bedrooms).max().orElse(0)),
                "bathrooms",               List.of(round2(rows.stream().mapToDouble(HouseRecord::bathrooms).min().orElse(0)),               round2(rows.stream().mapToDouble(HouseRecord::bathrooms).max().orElse(0))),
                "year_built",              List.of((double) rows.stream().mapToInt(HouseRecord::yearBuilt).min().orElse(0),                 (double) rows.stream().mapToInt(HouseRecord::yearBuilt).max().orElse(0)),
                "lot_size",                List.of(round2(rows.stream().mapToDouble(HouseRecord::lotSize).min().orElse(0)),                 round2(rows.stream().mapToDouble(HouseRecord::lotSize).max().orElse(0))),
                "distance_to_city_center", List.of(round2(rows.stream().mapToDouble(HouseRecord::distanceToCityCenter).min().orElse(0)),   round2(rows.stream().mapToDouble(HouseRecord::distanceToCityCenter).max().orElse(0))),
                "school_rating",           List.of(round2(rows.stream().mapToDouble(HouseRecord::schoolRating).min().orElse(0)),            round2(rows.stream().mapToDouble(HouseRecord::schoolRating).max().orElse(0)))
        );

        return new MarketStatistics(
                rows.size(),
                new MarketStatistics.PriceStats(
                        round2(priceStats.getMin()),
                        round2(priceStats.getMax()),
                        round2(priceStats.getAverage()),
                        round2(median)),
                new StatRange(round2(sqftStats.getAverage())),
                new StatRange(round2(yearStats.getAverage())),
                new StatRange(round2(schoolStats.getAverage())),
                trainingRanges,
                whatIfRangesConfig.toApiMap()
        );
    }

    // ── What-if analysis ─────────────────────────────────────────────────────

    /**
     * Calls the ML model for a live price prediction, then compares it
     * against the CSV-derived market average.
     */
    public WhatIfResponse whatIf(WhatIfRequest req) {
        double predictedPrice = round2(mlModelClient.predict(req));
        double avgPrice       = round2(getStatistics().priceStats().average());
        double diff           = round2(predictedPrice - avgPrice);
        double pct            = avgPrice > 0 ? round2((diff / avgPrice) * 100) : 0;

        return new WhatIfResponse(
                predictedPrice, "USD", req,
                new WhatIfResponse.MarketComparison(avgPrice, diff, pct),
                mlModelClient.getCoefficients());
    }

    // ── Insights ─────────────────────────────────────────────────────────────

    /**
     * All segment breakdowns and best-value lists are computed from real CSV rows.
     * Price drivers (coefficients) are still fetched from the ML model — they represent
     * the model's learned weights, not a raw-data statistic.
     * Result is cached; only the price-drivers field requires the ML model.
     */
    @Cacheable("insights")
    public InsightsResponse getInsights() {
        List<HouseRecord> rows = csvDataService.all();
        if (rows.isEmpty()) throw new RuntimeException("Dataset not loaded");

        // ── 1. Segment by bedroom count ──────────────────────────────────────
        var byBedrooms = rows.stream()
                .collect(Collectors.groupingBy(HouseRecord::bedrooms))
                .entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(e -> segmentFromRows(e.getKey() + " Bed", e.getValue()))
                .toList();

        // ── 2. Segment by school rating tier ─────────────────────────────────
        // Thresholds computed from dataset min/max → three equal-width bands
        double srMin = rows.stream().mapToDouble(HouseRecord::schoolRating).min().orElse(0);
        double srMax = rows.stream().mapToDouble(HouseRecord::schoolRating).max().orElse(10);
        double srSpan = (srMax - srMin) / 3.0;
        double srLo = round2(srMin + srSpan);
        double srHi = round2(srMin + 2 * srSpan);

        var bySchoolTier = List.of(
                segmentFromRows(String.format("Low (< %.1f)", srLo),
                        rows.stream().filter(r -> r.schoolRating() < srLo).toList()),
                segmentFromRows(String.format("Mid (%.1f – %.1f)", srLo, srHi),
                        rows.stream().filter(r -> r.schoolRating() >= srLo && r.schoolRating() < srHi).toList()),
                segmentFromRows(String.format("High (≥ %.1f)", srHi),
                        rows.stream().filter(r -> r.schoolRating() >= srHi).toList())
        );

        // ── 3. Segment by location zone ──────────────────────────────────────
        double dMin  = rows.stream().mapToDouble(HouseRecord::distanceToCityCenter).min().orElse(0);
        double dMax  = rows.stream().mapToDouble(HouseRecord::distanceToCityCenter).max().orElse(20);
        double dSpan = (dMax - dMin) / 3.0;
        double dLo   = round2(dMin + dSpan);
        double dHi   = round2(dMin + 2 * dSpan);

        var byLocationZone = List.of(
                segmentFromRows(String.format("Urban (≤ %.1f mi)", dLo),
                        rows.stream().filter(r -> r.distanceToCityCenter() <= dLo).toList()),
                segmentFromRows(String.format("Suburban (%.1f–%.1f mi)", dLo, dHi),
                        rows.stream().filter(r -> r.distanceToCityCenter() > dLo && r.distanceToCityCenter() <= dHi).toList()),
                segmentFromRows(String.format("Outer (> %.1f mi)", dHi),
                        rows.stream().filter(r -> r.distanceToCityCenter() > dHi).toList())
        );

        // ── 4. Price drivers from ML model coefficients ──────────────────────
        // These are the model's learned linear weights — not derivable from raw data alone.
        Map<String, String> labelMap = Map.of(
                "squareFootage",        "Square Footage",
                "bedrooms",             "Bedrooms",
                "bathrooms",            "Bathrooms",
                "yearBuilt",            "Year Built",
                "lotSize",              "Lot Size",
                "distanceToCityCenter", "Distance to City",
                "schoolRating",         "School Rating"
        );
        var priceDrivers = mlModelClient.getCoefficients().entrySet().stream()
                .map(e -> new PriceDriver(e.getKey(),
                        labelMap.getOrDefault(e.getKey(), e.getKey()),
                        e.getValue().priceChangePerUnit(), e.getValue().unit()))
                .sorted(Comparator.comparingDouble(d -> -Math.abs(d.priceChangePerUnit())))
                .toList();

        // ── 5 & 6. Best-value spots from real dataset rows ───────────────────
        var allSpots = rows.stream()
                .filter(r -> r.price() > 0 && r.squareFootage() > 0)
                .map(r -> new ValueSpot(
                        (int) r.squareFootage(),
                        r.bedrooms(),
                        r.bathrooms(),
                        r.yearBuilt(),
                        r.schoolRating(),
                        r.distanceToCityCenter(),
                        round2(r.price()),
                        round2(r.price() / r.squareFootage()),
                        round2(r.schoolRating() / (r.price() / 100_000.0))
                ))
                .toList();

        var bestByPrice = allSpots.stream()
                .sorted(Comparator.comparingDouble(ValueSpot::pricePerSqFt))
                .limit(8).toList();

        var bestBySchool = allSpots.stream()
                .sorted(Comparator.comparingDouble(ValueSpot::schoolPer100k).reversed())
                .limit(8).toList();

        return new InsightsResponse(
                byBedrooms, bySchoolTier, byLocationZone,
                priceDrivers, bestByPrice, bestBySchool);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Build a {@link SegmentInsight} from a list of real CSV rows. */
    private SegmentInsight segmentFromRows(String label, List<HouseRecord> rows) {
        if (rows.isEmpty()) return new SegmentInsight(label, 0, 0, 0, 0);
        double avgPrice  = round2(rows.stream().mapToDouble(HouseRecord::price).average().orElse(0));
        double avgSqFt   = round2(rows.stream().mapToDouble(HouseRecord::squareFootage).average().orElse(0));
        double avgSchool = round2(rows.stream().mapToDouble(HouseRecord::schoolRating).average().orElse(0));
        return new SegmentInsight(label, rows.size(), avgPrice, avgSqFt, avgSchool);
    }

    /** Compute the median of an unsorted array of doubles. */
    private double computeMedian(double[] values) {
        if (values.length == 0) return 0;
        double[] sorted = Arrays.copyOf(values, values.length);
        Arrays.sort(sorted);
        int mid = sorted.length / 2;
        return sorted.length % 2 == 0
                ? (sorted[mid - 1] + sorted[mid]) / 2.0
                : sorted[mid];
    }

    private double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}
