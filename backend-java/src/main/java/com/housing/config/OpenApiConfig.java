package com.housing.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Value("${frontend.url}")
    private String frontendUrl;

    @Bean
    public OpenAPI customOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("Property Market Analysis API")
                        .version("1.0.0")
                        .description("""
                                Java Spring Boot backend for the Property Market Analysis dashboard.
                                Provides aggregate housing market statistics, segment filtering,
                                what-if price analysis (backed by the ML model), and CSV/PDF export.
                                """)
                        .contact(new Contact()
                                .name("Housing Portal")
                                .url(frontendUrl)));
    }
}
