package com.housing.config;

import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cache.CacheManager;
import org.springframework.cache.caffeine.CaffeineCache;
import org.springframework.cache.support.SimpleCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.List;
import java.util.concurrent.TimeUnit;

@Configuration
public class CacheConfig {

    // ── Canonical cache names ────────────────────────────────────────────────
    // statistics and insights are computed from the CSV dataset (cheap to warm,
    // but still cached so every request is O(1) after the first).
    //
    // modelCoefficients is kept for the what-if sensitivity table — it is the
    // only remaining ML model call used by the dashboard.
    public static final String CACHE_MODEL_COEFF = "modelCoefficients";
    public static final String CACHE_STATISTICS  = "statistics";
    public static final String CACHE_INSIGHTS    = "insights";

    /** All cache names — used by the cache-evict endpoint and refresh job. */
    public static final List<String> ALL_CACHE_NAMES = List.of(
            CACHE_MODEL_COEFF, CACHE_STATISTICS, CACHE_INSIGHTS);

    @Value("${cache.refresh-interval-ms:600000}")
    private long refreshIntervalMs;

    @Bean
    public CacheManager cacheManager() {
        SimpleCacheManager manager = new SimpleCacheManager();
        manager.setCaches(List.of(
                // ML model coefficients — used only in the what-if sensitivity table
                caffeineCache(CACHE_MODEL_COEFF),
                // Market KPI stats — computed from CSV rows
                caffeineCache(CACHE_STATISTICS),
                // Full insights — segments + best-value, all from CSV rows
                caffeineCache(CACHE_INSIGHTS)
        ));
        return manager;
    }

    private CaffeineCache caffeineCache(String name) {
        return new CaffeineCache(name,
                Caffeine.newBuilder()
                        .maximumSize(1)
                        .expireAfterWrite(refreshIntervalMs, TimeUnit.MILLISECONDS)
                        .recordStats()
                        .build());
    }
}
