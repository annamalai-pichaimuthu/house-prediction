package com.housing;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

@SpringBootTest
@TestPropertySource(properties = {
        "ml-model.url=http://localhost:9999"   // dummy URL — no real ML model needed for context load test
})
class HousingApplicationTest {

    @Test
    void contextLoads() {
        // Verifies that the Spring context starts without errors
    }
}
