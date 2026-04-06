package com.housing.service;

import com.housing.model.dto.InsightsResponse;
import com.housing.model.dto.MarketStatistics;
import com.housing.model.dto.PriceDriver;
import com.housing.model.dto.ValueSpot;
import com.itextpdf.kernel.pdf.PdfDocument;
import com.itextpdf.kernel.pdf.PdfWriter;
import com.itextpdf.layout.Document;
import com.itextpdf.layout.element.Cell;
import com.itextpdf.layout.element.Paragraph;
import com.itextpdf.layout.element.Table;
import com.itextpdf.layout.properties.UnitValue;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.StringWriter;
import java.time.LocalDate;

/**
 * Generates CSV and PDF exports from model-derived market insights.
 * No raw dataset access — everything comes from MarketService.
 */
@Service
public class ExportService {

    private final MarketService marketService;

    public ExportService(MarketService marketService) {
        this.marketService = marketService;
    }

    // ── CSV ──────────────────────────────────────────────────────────────────

    /**
     * Exports model-derived market insights as CSV:
     * market summary stats, price drivers, and best-value configurations.
     */
    public String generateCsv() throws IOException {
        var sw = new StringWriter();
        MarketStatistics stats = marketService.getStatistics();
        InsightsResponse insights = marketService.getInsights();

        // Section 1: Market Summary
        sw.write("Market Overview\n");
        sw.write("Metric,Value\n");
        sw.write(String.format("Average Home Price,$%.0f%n", stats.priceStats().average()));
        sw.write(String.format("Median Home Price,$%.0f%n",  stats.priceStats().median()));
        sw.write(String.format("Lowest Listed Price,$%.0f%n", stats.priceStats().min()));
        sw.write(String.format("Highest Listed Price,$%.0f%n", stats.priceStats().max()));
        sw.write(String.format("Average Home Size,%.0f sq ft%n", stats.squareFootageStats().average()));
        sw.write(String.format("Average School Rating,%.1f / 10%n", stats.schoolRatingStats().average()));
        sw.write("\n");

        // Section 2: What Adds Value
        sw.write("What Adds Value to a Home\n");
        sw.write("Feature,Estimated Price Impact,Per\n");
        for (PriceDriver d : insights.priceDrivers()) {
            sw.write(String.format("%s,$%.2f,%s%n", d.label(), d.priceChangePerUnit(), d.unit()));
        }
        sw.write("\n");

        // Section 3: Best Space for Your Money
        sw.write("Best Space for Your Money (Highest Size per Dollar)\n");
        sw.write("Size (sq ft),Bedrooms,Bathrooms,Year Built,School Rating,Distance to City (mi),Estimated Price,Price per Sq Ft\n");
        for (ValueSpot v : insights.bestByPrice()) {
            sw.write(String.format("%d,%d,%.1f,%d,%.1f,%.2f,$%.0f,$%.2f%n",
                    v.squareFootage(), v.bedrooms(), v.bathrooms(), v.yearBuilt(),
                    v.schoolRating(), v.distanceToCityCenter(), v.price(), v.pricePerSqFt()));
        }
        sw.write("\n");

        // Section 4: Best School Zone Value
        sw.write("Best School Zone Value (Top School Rating per $100k)\n");
        sw.write("Size (sq ft),Bedrooms,Bathrooms,Year Built,School Rating,Distance to City (mi),Estimated Price,School Rating per $100k\n");
        for (ValueSpot v : insights.bestBySchool()) {
            sw.write(String.format("%d,%d,%.1f,%d,%.1f,%.2f,$%.0f,%.2f%n",
                    v.squareFootage(), v.bedrooms(), v.bathrooms(), v.yearBuilt(),
                    v.schoolRating(), v.distanceToCityCenter(), v.price(), v.schoolPer100k()));
        }

        return sw.toString();
    }

    // ── PDF ──────────────────────────────────────────────────────────────────

    /**
     * Generates a PDF report with market summary, price drivers,
     * and best-value property configurations — all model-derived.
     */
    public byte[] generatePdf() throws IOException {
        var baos = new ByteArrayOutputStream();
        try (var doc = new Document(new PdfDocument(new PdfWriter(baos)))) {
            MarketStatistics stats = marketService.getStatistics();
            InsightsResponse insights = marketService.getInsights();

            // ── Title ─────────────────────────────────────────────────────
            doc.add(new Paragraph("Property Market Report").setFontSize(20).setBold());
            doc.add(new Paragraph("Generated: " + LocalDate.now())
                    .setFontSize(10).setMarginBottom(20));
            doc.add(new Paragraph("Market insights based on residential property data in your area.")
                    .setFontSize(9).setItalic().setMarginBottom(16));

            // ── Market Summary ────────────────────────────────────────────
            doc.add(new Paragraph("Market Overview").setFontSize(14).setBold().setMarginBottom(8));
            Table summaryTable = new Table(UnitValue.createPercentArray(new float[]{50, 50}))
                    .setWidth(UnitValue.createPercentValue(100));
            addRow(summaryTable, "Average Home Price",   "$" + String.format("%.0f", stats.priceStats().average()));
            addRow(summaryTable, "Median Home Price",    "$" + String.format("%.0f", stats.priceStats().median()));
            addRow(summaryTable, "Lowest Listed Price",  "$" + String.format("%.0f", stats.priceStats().min()));
            addRow(summaryTable, "Highest Listed Price", "$" + String.format("%.0f", stats.priceStats().max()));
            addRow(summaryTable, "Average Home Size",    String.format("%.0f sq ft", stats.squareFootageStats().average()));
            addRow(summaryTable, "Average School Rating", String.format("%.1f / 10", stats.schoolRatingStats().average()));
            doc.add(summaryTable);
            doc.add(new Paragraph("\n"));

            // ── What Adds Value ───────────────────────────────────────────
            doc.add(new Paragraph("What Adds Value to a Home").setFontSize(14).setBold().setMarginBottom(8));
            Table driversTable = new Table(UnitValue.createPercentArray(new float[]{40, 30, 30}))
                    .setWidth(UnitValue.createPercentValue(100));
            driversTable.addHeaderCell(new Cell().add(new Paragraph("Feature").setBold()));
            driversTable.addHeaderCell(new Cell().add(new Paragraph("Est. Price Impact").setBold()));
            driversTable.addHeaderCell(new Cell().add(new Paragraph("Per").setBold()));
            for (PriceDriver d : insights.priceDrivers()) {
                driversTable.addCell(d.label());
                driversTable.addCell(String.format("$%.2f", d.priceChangePerUnit()));
                driversTable.addCell(d.unit());
            }
            doc.add(driversTable);
            doc.add(new Paragraph("\n"));

            // ── Best Value ────────────────────────────────────────────────
            doc.add(new Paragraph("Best Space for Your Money").setFontSize(14).setBold().setMarginBottom(8));
            doc.add(valueTable(insights.bestByPrice(), false));
            doc.add(new Paragraph("\n"));

            doc.add(new Paragraph("Best School Zone Value").setFontSize(14).setBold().setMarginBottom(8));
            doc.add(valueTable(insights.bestBySchool(), true));
        }
        return baos.toByteArray();
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private Table valueTable(java.util.List<ValueSpot> spots, boolean schoolMode) {
        Table t = new Table(UnitValue.createPercentArray(new float[]{10, 8, 8, 8, 10, 10, 14, 14}))
                .setWidth(UnitValue.createPercentValue(100)).setFontSize(8);
        String metricHeader = schoolMode ? "Rating/$100k" : "Price/Sq Ft";
        for (String h : new String[]{"Size (sq ft)", "Beds", "Baths", "Year Built", "School Rating", "City Dist.", "Est. Price", metricHeader})
            t.addHeaderCell(new Cell().add(new Paragraph(h).setBold()));
        for (ValueSpot v : spots) {
            t.addCell(String.valueOf(v.squareFootage()));
            t.addCell(String.valueOf(v.bedrooms()));
            t.addCell(String.format("%.1f", v.bathrooms()));
            t.addCell(String.valueOf(v.yearBuilt()));
            t.addCell(String.format("%.1f", v.schoolRating()));
            t.addCell(String.format("%.1f mi", v.distanceToCityCenter()));
            t.addCell(String.format("$%.0f", v.price()));
            t.addCell(schoolMode
                    ? String.format("%.2f", v.schoolPer100k())
                    : String.format("$%.2f", v.pricePerSqFt()));
        }
        return t;
    }

    private void addRow(Table table, String label, String value) {
        table.addCell(new Cell().add(new Paragraph(label).setBold()));
        table.addCell(new Cell().add(new Paragraph(value)));
    }
}
