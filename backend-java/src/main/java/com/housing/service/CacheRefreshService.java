package com.housing.service;

import com.housing.config.CacheConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/**
 * Periodically evicts all Caffeine caches so stale data is cleared.
 *
 * statistics and insights are derived from the static CSV — they don't
 * change at runtime, but the eviction schedule keeps them from growing
 * stale if the CSV is ever replaced and the app is restarted.
 *
 * modelCoefficients is the only ML model cache that remains; it is evicted
 * on the same schedule so what-if sensitivity data stays fresh after a
 * model retrain.
 */
@Service
public class CacheRefreshService {

    private static final Logger log = LoggerFactory.getLogger(CacheRefreshService.class);

    @Scheduled(fixedDelayString = "${cache.refresh-interval-ms:600000}",
               initialDelayString = "${cache.initial-delay-ms:30000}")
    @CacheEvict(cacheNames = {
            CacheConfig.CACHE_MODEL_COEFF,
            CacheConfig.CACHE_STATISTICS,
            CacheConfig.CACHE_INSIGHTS
    }, allEntries = true)
    public void evictAll() {
        log.debug("Cache evicted — statistics, insights, and model coefficients cleared.");
    }
}
