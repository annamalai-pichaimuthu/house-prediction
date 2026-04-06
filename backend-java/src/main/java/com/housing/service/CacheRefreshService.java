package com.housing.service;

import com.housing.config.CacheConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class CacheRefreshService {

    private static final Logger log = LoggerFactory.getLogger(CacheRefreshService.class);

    @Scheduled(fixedDelayString = "${cache.refresh-interval-ms:600000}",
               initialDelayString = "${cache.initial-delay-ms:30000}")
    @CacheEvict(cacheNames = {
            CacheConfig.CACHE_MODEL_INFO,
            CacheConfig.CACHE_MODEL_COEFF,
            CacheConfig.CACHE_STATISTICS,
            CacheConfig.CACHE_INSIGHTS,
    }, allEntries = true)
    public void evictAll() {
        log.debug("Cache evicted — all entries cleared. Next request will repopulate from ML model.");
    }
}
