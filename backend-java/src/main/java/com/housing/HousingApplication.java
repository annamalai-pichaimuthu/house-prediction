package com.housing;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;

import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableCaching
@EnableScheduling
public class HousingApplication {

    private static final Logger log = LoggerFactory.getLogger(HousingApplication.class);

    private final Environment env;

    public HousingApplication(Environment env) {
        this.env = env;
    }

    public static void main(String[] args) {
        SpringApplication.run(HousingApplication.class, args);
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        log.info("=== Property Market Analysis API started ===");
        log.info("APP_ENV      : {}", env.getProperty("APP_ENV", "development"));
        log.info("LOG_LEVEL    : {}", env.getProperty("LOG_LEVEL", "INFO"));
        log.info("Server port  : {}", env.getProperty("server.port", "9090"));
        log.info("ML_MODEL_URL : {}", env.getProperty("ml-model.url", "http://localhost:8000"));
    }
}
