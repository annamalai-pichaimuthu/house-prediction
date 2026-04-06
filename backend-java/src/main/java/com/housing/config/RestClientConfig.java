package com.housing.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;

@Configuration
public class RestClientConfig {

    @Value("${ml-model.url}")
    private String mlModelUrl;

    /**
     * RestClient (Spring 6.1) for all calls to the ML model container.
     * Base URL is injected from application.yml / ML_MODEL_URL env var.
     *
     * HTTP/1.1 is forced explicitly — Uvicorn does not support h2c upgrade
     * (HTTP/2 cleartext), which Java's HttpClient attempts by default in
     * Spring Boot 3.4+.
     */
    @Bean
    public RestClient mlModelRestClient() {
        HttpClient http11Client = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .build();

        return RestClient.builder()
                .baseUrl(mlModelUrl)
                .requestFactory(new JdkClientHttpRequestFactory(http11Client))
                .defaultHeader("Content-Type", "application/json")
                .defaultHeader("Accept", "application/json")
                .build();
    }
}
