package com.housing.controller;

import com.housing.model.dto.HealthResponse;
import com.housing.service.MlModelClient;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;

@RestController
@RequestMapping("/api")
@Tag(name = "Health", description = "Service health check")
public class HealthController {

    private final MlModelClient mlModelClient;

    public HealthController(MlModelClient mlModelClient) {
        this.mlModelClient = mlModelClient;
    }

    @GetMapping("/health")
    @Operation(summary = "Health check", description = "Returns service status and ML model connectivity")
    public ResponseEntity<HealthResponse> health() {
        var info = mlModelClient.getModelInfo();
        return ResponseEntity.ok(new HealthResponse(
                "UP",
                mlModelClient.isHealthy(),
                info != null ? info.trainingRows() : 0,
                Instant.now()
        ));
    }
}
