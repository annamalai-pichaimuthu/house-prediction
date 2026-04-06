package com.housing.model.dto;

import java.time.Instant;

/**
 * Response for GET /api/health.
 */
public record HealthResponse(
        String status,
        boolean mlModelConnected,
        int totalProperties,
        Instant timestamp
) {}
