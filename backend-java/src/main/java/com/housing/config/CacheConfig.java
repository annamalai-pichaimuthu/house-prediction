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
    // Single definition used by @Cacheable annotations, CacheRefreshService,
    // and MarketController — a rename is one change, not three.
    public static final String CACHE_MODEL_INFO  = "modelInfo";
    public static final String CACHE_MODEL_COEFF = "modelCoefficients";
    public static final String CACHE_STATISTICS  = "statistics";
    public static final String CACHE_INSIGHTS    = "insights";

    /** All four cache names in declaration order. */
    public static final List<String> ALL_CACHE_NAMES = List.of(
            CACHE_MODEL_INFO, CACHE_MODEL_COEFF, CACHE_STATISTICS, CACHE_INSIGHTS);

    @Value("${cache.refresh-interval-ms:600000}")
    private long refreshIntervalMs;

    @Bean
    public CacheManager cacheManager() {
        SimpleCacheManager manager = new SimpleCacheManager();
        manager.setCaches(List.of(
                // ML model metadata — source of truth for all other caches
                caffeineCache(CACHE_MODEL_INFO),
                // Derived coefficients — same lifecycle as modelInfo
                caffeineCache(CACHE_MODEL_COEFF),
                // Market KPI stats — derived from 3 ML predictions
                caffeineCache(CACHE_STATISTICS),
                // Full insights — 288 ML predictions; most expensive to compute
                caffeineCache(CACHE_INSIGHTS)
        ));
        return manager;
    }

    private CaffeineCache caffeineCache(String name) {
        return new CaffeineCache(name,
                Caffeine.newBuilder()
                        .maximumSize(1)                                         // single global entry per cache
                        .expireAfterWrite(refreshIntervalMs, TimeUnit.MILLISECONDS)
                        .recordStats()
                        .build());
    }
}
