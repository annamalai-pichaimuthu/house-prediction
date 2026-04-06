package com.housing.service;

import com.housing.config.WhatIfRangesConfig;
import com.housing.model.dto.*;
import com.housing.service.MlModelClient.MlModelInfo;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class MarketService {

    private final MlModelClient      mlModelClient;
    private final WhatIfRangesConfig whatIfRangesConfig;

    public MarketService(MlModelClient mlModelClient, WhatIfRangesConfig whatIfRangesConfig) {
        this.mlModelClient      = mlModelClient;
        this.whatIfRangesConfig = whatIfRangesConfig;
    }

    // ── Statistics ───────────────────────────────────────────────────────────

    @Cacheable("statistics")
    public MarketStatistics getStatistics() {
        MlModelInfo info = mlModelClient.getModelInfo();
        if (info == null) throw new RuntimeException("ML model unavailable");

        var ranges = info.trainingRanges();

        // Predict prices at three representative configs to derive market range
        var configs = List.of(
                synthLow(ranges),   // all features at their training minimum
                midpoint(ranges),   // all features at their training midpoint
                synthHigh(ranges)   // all features at their training maximum
        );
        var prices = mlModelClient.batchPredict(configs);

        double minPrice = prices.stream().mapToDouble(Double::doubleValue).min().orElse(0);
        double maxPrice = prices.stream().mapToDouble(Double::doubleValue).max().orElse(0);
        double avgPrice = prices.stream().mapToDouble(Double::doubleValue).average().orElse(0);

        return new MarketStatistics(
                info.trainingRows(),
                new MarketStatistics.PriceStats(
                        round2(minPrice), round2(maxPrice),
                        round2(avgPrice), round2((minPrice + maxPrice) / 2.0)),
                new StatRange(round2(midOf(ranges, "square_footage"))),
                new StatRange(round2(midOf(ranges, "year_built"))),
                new StatRange(round2(midOf(ranges, "school_rating"))),
                ranges,                            // training_ranges — for internal computations
                whatIfRangesConfig.toApiMap()      // realistic UI bounds — for what-if sliders
        );
    }

    // ── What-if analysis ─────────────────────────────────────────────────────

    public WhatIfResponse whatIf(WhatIfRequest req) {
        double predictedPrice = round2(mlModelClient.predict(req));
        double avgPrice = round2(getStatistics().priceStats().average());
        double diff = round2(predictedPrice - avgPrice);
        double pct = avgPrice > 0 ? round2((diff / avgPrice) * 100) : 0;

        return new WhatIfResponse(
                predictedPrice, "USD", req,
                new WhatIfResponse.MarketComparison(avgPrice, diff, pct),
                mlModelClient.getCoefficients());
    }

    // ── Insights ─────────────────────────────────────────────────────────────

    @Cacheable("insights")
    public InsightsResponse getInsights() {
        MlModelInfo info = mlModelClient.getModelInfo();
        if (info == null) throw new RuntimeException("ML model unavailable");

        var ranges = info.trainingRanges();

        // ── 1. Segment by bedroom count ──────────────────────────────────────
        int[] bedroomValues = intLinspace(ranges, "bedrooms", 3);
        var bedroomInputs   = Arrays.stream(bedroomValues)
                .mapToObj(b -> synthWith(ranges, "bedrooms", (double) b))
                .toList();
        var bedroomPrices = mlModelClient.batchPredict(bedroomInputs);
        var byBedrooms    = new ArrayList<SegmentInsight>();
        for (int i = 0; i < bedroomValues.length; i++) {
            byBedrooms.add(makeSegment(
                    bedroomValues[i] + " Bed",
                    bedroomPrices.get(i),
                    midOf(ranges, "square_footage"),
                    midOf(ranges, "school_rating")));
        }

        // ── 2. Segment by school rating tier ─────────────────────────────────
        // Divide school_rating range into 3 equal zones; use each zone's centre.
        double[] srBounds   = zoneBoundaries(ranges, "school_rating");   // [b1, b2]
        double   srMin      = rangeMin(ranges, "school_rating");
        double   srMax      = rangeMax(ranges, "school_rating");
        double[] srCentres  = zoneCentres(srMin, srMax, 3);
        var schoolInputs    = Arrays.stream(srCentres)
                .mapToObj(v -> synthWith(ranges, "school_rating", v))
                .toList();
        var schoolPrices = mlModelClient.batchPredict(schoolInputs);
        var bySchoolTier = List.of(
                makeSegment(
                        String.format("Low (< %.1f)", srBounds[0]),
                        schoolPrices.get(0),
                        midOf(ranges, "square_footage"), srCentres[0]),
                makeSegment(
                        String.format("Mid (%.1f – %.1f)", srBounds[0], srBounds[1]),
                        schoolPrices.get(1),
                        midOf(ranges, "square_footage"), srCentres[1]),
                makeSegment(
                        String.format("High (≥ %.1f)", srBounds[1]),
                        schoolPrices.get(2),
                        midOf(ranges, "square_footage"), srCentres[2])
        );

        // ── 3. Segment by location zone ──────────────────────────────────────
        // Divide distance_to_city_center range into 3 equal zones.
        double[] distBounds  = zoneBoundaries(ranges, "distance_to_city_center");
        double   distMin     = rangeMin(ranges, "distance_to_city_center");
        double   distMax     = rangeMax(ranges, "distance_to_city_center");
        double[] distCentres = zoneCentres(distMin, distMax, 3);
        var locationInputs   = Arrays.stream(distCentres)
                .mapToObj(v -> synthWith(ranges, "distance_to_city_center", v))
                .toList();
        var locationPrices  = mlModelClient.batchPredict(locationInputs);
        var byLocationZone  = List.of(
                makeSegment(
                        String.format("Urban (≤ %.1f mi)", distBounds[0]),
                        locationPrices.get(0),
                        midOf(ranges, "square_footage"), midOf(ranges, "school_rating")),
                makeSegment(
                        String.format("Suburban (%.1f–%.1f mi)", distBounds[0], distBounds[1]),
                        locationPrices.get(1),
                        midOf(ranges, "square_footage"), midOf(ranges, "school_rating")),
                makeSegment(
                        String.format("Outer (> %.1f mi)", distBounds[1]),
                        locationPrices.get(2),
                        midOf(ranges, "square_footage"), midOf(ranges, "school_rating"))
        );

        // ── 4. Price drivers from model coefficients ──────────────────────────
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

        // ── 5 & 6. Best-value grid ────────────────────────────────────────────
        // Evenly sample each feature's training range — 6 × 3 × 4 × 4 = 288 combos.
        double[] sqFts     = linspace(ranges, "square_footage",          6);
        int[]    beds      = intLinspace(ranges, "bedrooms",              3);
        double[] schools   = linspace(ranges, "school_rating",            4);
        double[] distances = linspace(ranges, "distance_to_city_center",  4);
        double   bathMid   = midOf(ranges, "bathrooms");
        double   yearMid   = midOf(ranges, "year_built");
        double   lotMid    = midOf(ranges, "lot_size");

        List<WhatIfRequest> grid = new ArrayList<>();
        for (double sqft : sqFts)
            for (int bed : beds)
                for (double school : schools)
                    for (double dist : distances)
                        grid.add(new WhatIfRequest(
                                sqft, bed, bathMid, (int) Math.round(yearMid),
                                lotMid, dist, school));

        var gridPrices = mlModelClient.batchPredict(grid);

        List<ValueSpot> allSpots = new ArrayList<>();
        for (int i = 0; i < grid.size(); i++) {
            WhatIfRequest r = grid.get(i);
            double price = gridPrices.get(i);
            if (price <= 0) continue;
            allSpots.add(new ValueSpot(
                    r.squareFootage().intValue(), r.bedrooms(), r.bathrooms(), r.yearBuilt(),
                    r.schoolRating(), r.distanceToCityCenter(), round2(price),
                    round2(price / r.squareFootage()),
                    round2(r.schoolRating() / (price / 100_000.0))));
        }

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

    // ── Synthetic input builders ──────────────────────────────────────────────

    /** All features at their training midpoints. */
    private WhatIfRequest midpoint(Map<String, List<Double>> r) {
        return new WhatIfRequest(
                midOf(r, "square_footage"),
                (int) Math.round(midOf(r, "bedrooms")),
                midOf(r, "bathrooms"),
                (int) Math.round(midOf(r, "year_built")),
                midOf(r, "lot_size"),
                midOf(r, "distance_to_city_center"),
                midOf(r, "school_rating"));
    }

    /** All features at their training minimums. */
    private WhatIfRequest synthLow(Map<String, List<Double>> r) {
        return new WhatIfRequest(
                rangeMin(r, "square_footage"),
                (int) Math.round(rangeMin(r, "bedrooms")),
                rangeMin(r, "bathrooms"),
                (int) Math.round(rangeMin(r, "year_built")),
                rangeMin(r, "lot_size"),
                rangeMax(r, "distance_to_city_center"),  // farthest = lower price
                rangeMin(r, "school_rating"));
    }

    /** All features at their training maximums. */
    private WhatIfRequest synthHigh(Map<String, List<Double>> r) {
        return new WhatIfRequest(
                rangeMax(r, "square_footage"),
                (int) Math.round(rangeMax(r, "bedrooms")),
                rangeMax(r, "bathrooms"),
                (int) Math.round(rangeMax(r, "year_built")),
                rangeMax(r, "lot_size"),
                rangeMin(r, "distance_to_city_center"),  // nearest = higher price
                rangeMax(r, "school_rating"));
    }

    /** Override a single feature on the midpoint input. */
    private WhatIfRequest synthWith(Map<String, List<Double>> r, String feature, double value) {
        WhatIfRequest mp = midpoint(r);
        return switch (feature) {
            case "bedrooms"                -> new WhatIfRequest(mp.squareFootage(), (int) Math.round(value), mp.bathrooms(), mp.yearBuilt(), mp.lotSize(), mp.distanceToCityCenter(), mp.schoolRating());
            case "school_rating"           -> new WhatIfRequest(mp.squareFootage(), mp.bedrooms(), mp.bathrooms(), mp.yearBuilt(), mp.lotSize(), mp.distanceToCityCenter(), value);
            case "distance_to_city_center" -> new WhatIfRequest(mp.squareFootage(), mp.bedrooms(), mp.bathrooms(), mp.yearBuilt(), mp.lotSize(), value, mp.schoolRating());
            default -> mp;
        };
    }

    // ── Range helpers ─────────────────────────────────────────────────────────

    private double rangeMin(Map<String, List<Double>> r, String key) {
        return r.getOrDefault(key, List.of(0.0, 1.0)).get(0);
    }

    private double rangeMax(Map<String, List<Double>> r, String key) {
        return r.getOrDefault(key, List.of(0.0, 1.0)).get(1);
    }

    private double midOf(Map<String, List<Double>> r, String key) {
        return (rangeMin(r, key) + rangeMax(r, key)) / 2.0;
    }

    private double[] linspace(Map<String, List<Double>> r, String key, int n) {
        double lo = rangeMin(r, key), hi = rangeMax(r, key);
        double[] pts = new double[n];
        for (int i = 0; i < n; i++)
            pts[i] = round2(lo + (hi - lo) * i / (n - 1));
        return pts;
    }

    private int[] intLinspace(Map<String, List<Double>> r, String key, int n) {
        int lo = (int) Math.round(rangeMin(r, key));
        int hi = (int) Math.round(rangeMax(r, key));
        int[] pts = new int[n];
        for (int i = 0; i < n; i++)
            pts[i] = (int) Math.round(lo + (double)(hi - lo) * i / (n - 1));
        return pts;
    }

    private double[] zoneBoundaries(Map<String, List<Double>> r, String key) {
        double lo = rangeMin(r, key), hi = rangeMax(r, key);
        double span = (hi - lo) / 3.0;
        return new double[]{ round2(lo + span), round2(lo + 2 * span) };
    }

    private double[] zoneCentres(double lo, double hi, int n) {
        double zoneWidth = (hi - lo) / n;
        double[] centres = new double[n];
        for (int i = 0; i < n; i++)
            centres[i] = round2(lo + zoneWidth * (i + 0.5));
        return centres;
    }

    private SegmentInsight makeSegment(String label, double avgPrice, double avgSqFt, double avgSchool) {
        return new SegmentInsight(label, 0, round2(avgPrice), round2(avgSqFt), round2(avgSchool));
    }

    private double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}
