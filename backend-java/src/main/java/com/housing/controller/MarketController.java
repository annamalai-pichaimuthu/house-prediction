package com.housing.controller;

import com.housing.config.CacheConfig;
import com.housing.model.HouseRecord;
import com.housing.model.dto.*;
import com.housing.service.CsvDataService;
import com.housing.service.ExportService;
import com.housing.service.MarketService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.cache.CacheManager;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.List;

@RestController
@RequestMapping("/api/market")
@Tag(name = "Market Analysis", description = "Housing market statistics, segment filtering, what-if analysis, and data export")
public class MarketController {

    private static final List<String> ALL_CACHES = CacheConfig.ALL_CACHE_NAMES;

    private final MarketService  marketService;
    private final ExportService  exportService;
    private final CsvDataService csvDataService;
    private final CacheManager   cacheManager;

    public MarketController(MarketService marketService, ExportService exportService,
                            CsvDataService csvDataService, CacheManager cacheManager) {
        this.marketService  = marketService;
        this.exportService  = exportService;
        this.csvDataService = csvDataService;
        this.cacheManager   = cacheManager;
    }

    // ── Property listing ──────────────────────────────────────────────────────

    @GetMapping("/properties")
    @Operation(summary = "Full property listing",
               description = "Returns all rows from the CSV dataset as JSON for the interactive property table.")
    public ResponseEntity<List<HouseRecord>> properties() {
        return ResponseEntity.ok(csvDataService.all());
    }

    // ── Insights ─────────────────────────────────────────────────────────────

    @GetMapping("/insights")
    @Operation(summary = "Market insights",
               description = "Pre-computed segment breakdowns, price drivers, and best-value picks. Response is cached.")
    public ResponseEntity<InsightsResponse> insights() {
        return ResponseEntity.ok(marketService.getInsights());
    }

    // ── Statistics ───────────────────────────────────────────────────────────

    @GetMapping("/statistics")
    @Operation(summary = "Market statistics",
               description = "Returns aggregate statistics for the full housing dataset. Response is cached.")
    public ResponseEntity<MarketStatistics> statistics() {
        return ResponseEntity.ok(marketService.getStatistics());
    }

    // ── What-if analysis ─────────────────────────────────────────────────────

    @PostMapping("/whatif")
    @Operation(summary = "What-if price analysis",
               description = "Predicts the price for given property features using the ML model. "
                           + "Also returns market comparison and feature sensitivity analysis.")
    public ResponseEntity<WhatIfResponse> whatIf(@Valid @RequestBody WhatIfRequest request) {
        return ResponseEntity.ok(marketService.whatIf(request));
    }

    // ── Cache management ─────────────────────────────────────────────────────

    @PostMapping("/cache/evict")
    @Operation(summary = "Evict all market caches",
               description = "Clears all four Caffeine caches so the next request re-fetches from "
                           + "the ML model. Use after retraining the model to get fresh insights immediately.")
    public ResponseEntity<Void> evictCaches() {
        ALL_CACHES.forEach(name -> {
            var cache = cacheManager.getCache(name);
            if (cache != null) cache.clear();
        });
        return ResponseEntity.noContent().build();
    }

    // ── Exports ──────────────────────────────────────────────────────────────

    @GetMapping("/export/csv")
    @Operation(summary = "Export market data as CSV",
               description = "Downloads selected dashboard sections as CSV. All sections included by default.")
    public ResponseEntity<byte[]> exportCsv(
            @RequestParam(defaultValue = "true") boolean includeOverview,
            @RequestParam(defaultValue = "true") boolean includeSegments,
            @RequestParam(defaultValue = "true") boolean includeDrivers,
            @RequestParam(defaultValue = "true") boolean includeTopPicks,
            @RequestParam(defaultValue = "true") boolean includeListing
    ) throws IOException {
        var opts = new ExportOptions(
                includeOverview, includeSegments, includeDrivers, includeTopPicks, includeListing);
        byte[] csv = exportService.generateCsv(opts).getBytes(StandardCharsets.UTF_8);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"housing_market_data.csv\"")
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .contentLength(csv.length)
                .body(csv);
    }

    @GetMapping("/export/pdf")
    @Operation(summary = "Export market report as PDF",
               description = "Downloads selected dashboard sections as a PDF report. All sections included by default.")
    public ResponseEntity<byte[]> exportPdf(
            @RequestParam(defaultValue = "true") boolean includeOverview,
            @RequestParam(defaultValue = "true") boolean includeSegments,
            @RequestParam(defaultValue = "true") boolean includeDrivers,
            @RequestParam(defaultValue = "true") boolean includeTopPicks,
            @RequestParam(defaultValue = "true") boolean includeListing
    ) throws IOException {
        var opts = new ExportOptions(
                includeOverview, includeSegments, includeDrivers, includeTopPicks, includeListing);
        byte[] pdf = exportService.generatePdf(opts);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"housing_market_report.pdf\"")
                .contentType(MediaType.APPLICATION_PDF)
                .contentLength(pdf.length)
                .body(pdf);
    }
}
