package com.housing.controller;

import com.housing.config.CacheConfig;
import com.housing.model.dto.*;
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
import java.util.List;

@RestController
@RequestMapping("/api/market")
@Tag(name = "Market Analysis", description = "Housing market statistics, segment filtering, what-if analysis, and data export")
public class MarketController {

    private static final List<String> ALL_CACHES = CacheConfig.ALL_CACHE_NAMES;

    private final MarketService marketService;
    private final ExportService exportService;
    private final CacheManager  cacheManager;

    public MarketController(MarketService marketService, ExportService exportService,
                            CacheManager cacheManager) {
        this.marketService = marketService;
        this.exportService = exportService;
        this.cacheManager  = cacheManager;
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
    @Operation(summary = "Export dataset as CSV",
               description = "Downloads the full housing dataset as a CSV file.")
    public ResponseEntity<byte[]> exportCsv() throws IOException {
        byte[] csv = exportService.generateCsv().getBytes();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"housing_market_data.csv\"")
                .contentType(MediaType.parseMediaType("text/csv; charset=UTF-8"))
                .contentLength(csv.length)
                .body(csv);
    }

    @GetMapping("/export/pdf")
    @Operation(summary = "Export market report as PDF",
               description = "Downloads a PDF report with market summary statistics and the full property listing.")
    public ResponseEntity<byte[]> exportPdf() throws IOException {
        byte[] pdf = exportService.generatePdf();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"housing_market_report.pdf\"")
                .contentType(MediaType.APPLICATION_PDF)
                .contentLength(pdf.length)
                .body(pdf);
    }
}
