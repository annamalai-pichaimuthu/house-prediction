package com.housing.service;

import com.housing.model.HouseRecord;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Loads House_Price_Dataset.csv from the classpath exactly once on startup
 * and exposes the parsed rows as an immutable list.
 *
 * Because the CSV never changes at runtime, the list is populated during
 * {@code @PostConstruct} and then treated as read-only — no locking needed.
 */
@Service
public class CsvDataService {

    private static final Logger log = LoggerFactory.getLogger(CsvDataService.class);
    private static final String CSV_PATH = "House_Price_Dataset.csv";

    private List<HouseRecord> records = List.of();

    @PostConstruct
    void load() {
        var loaded = new ArrayList<HouseRecord>();
        try (var reader = new BufferedReader(new InputStreamReader(
                new ClassPathResource(CSV_PATH).getInputStream(), StandardCharsets.UTF_8))) {

            String line = reader.readLine(); // skip header
            int lineNum = 1;
            while ((line = reader.readLine()) != null) {
                lineNum++;
                line = line.trim();
                if (line.isEmpty()) continue;
                try {
                    String[] cols = line.split(",");
                    loaded.add(new HouseRecord(
                            Integer.parseInt(cols[0].trim()),
                            Double.parseDouble(cols[1].trim()),
                            Integer.parseInt(cols[2].trim()),
                            Double.parseDouble(cols[3].trim()),
                            Integer.parseInt(cols[4].trim()),
                            Double.parseDouble(cols[5].trim()),
                            Double.parseDouble(cols[6].trim()),
                            Double.parseDouble(cols[7].trim()),
                            Double.parseDouble(cols[8].trim())
                    ));
                } catch (Exception e) {
                    log.warn("Skipping malformed CSV line {}: {}", lineNum, e.getMessage());
                }
            }
        } catch (Exception e) {
            log.error("Failed to load {}. Dashboard will be empty.", CSV_PATH, e);
        }

        records = Collections.unmodifiableList(loaded);
        log.info("Loaded {} house records from {}", records.size(), CSV_PATH);
    }

    /** Returns the full immutable list of house records. */
    public List<HouseRecord> all() {
        return records;
    }
}
