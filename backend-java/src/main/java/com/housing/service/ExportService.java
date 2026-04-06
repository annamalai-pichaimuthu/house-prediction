package com.housing.service;

import com.housing.model.HouseRecord;
import com.housing.model.dto.ExportOptions;
import com.housing.model.dto.InsightsResponse;
import com.housing.model.dto.MarketStatistics;
import com.housing.model.dto.PriceDriver;
import com.housing.model.dto.SegmentInsight;
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
import java.util.List;

/**
 * Generates CSV and PDF exports from market insights and the raw CSV dataset.
 */
@Service
public class ExportService {

    private final MarketService  marketService;
    private final CsvDataService csvDataService;

    public ExportService(MarketService marketService, CsvDataService csvDataService) {
        this.marketService  = marketService;
        this.csvDataService = csvDataService;
    }

    // ── CSV ──────────────────────────────────────────────────────────────────

    /**
     * Exports selected dashboard sections as CSV.
     * Each section is only written when the corresponding flag in {@link ExportOptions} is {@code true}.
     */
    public String generateCsv(ExportOptions opts) throws IOException {
        var sw = new StringWriter();
        // Fetch lazily — only call the service if at least one insights section is needed
        MarketStatistics stats    = marketService.getStatistics();
        InsightsResponse insights = (opts.includeSegments() || opts.includeDrivers() || opts.includeTopPicks())
                ? marketService.getInsights() : null;

        // ── 1. Market KPIs ────────────────────────────────────────────────────
        if (opts.includeOverview()) {
            sw.write("Market Overview\n");
            sw.write("Metric,Value\n");
            sw.write(String.format("Total Properties,%d\n",  stats.totalProperties()));
            sw.write(String.format("Average Price,%.0f\n",   stats.priceStats().average()));
            sw.write(String.format("Median Price,%.0f\n",    stats.priceStats().median()));
            sw.write(String.format("Lowest Price,%.0f\n",    stats.priceStats().min()));
            sw.write(String.format("Highest Price,%.0f\n",   stats.priceStats().max()));
            sw.write(String.format("Avg Size (sq ft),%.0f\n",              stats.squareFootageStats().average()));
            sw.write(String.format("Avg Year Built,%.0f\n",                stats.yearBuiltStats().average()));
            sw.write(String.format("Avg School Rating (out of 10),%.1f\n", stats.schoolRatingStats().average()));
            sw.write("\n");
        }

        // ── 2. Segment pricing ────────────────────────────────────────────────
        if (opts.includeSegments() && insights != null) {
            sw.write("Average Price by Bedroom Count\n");
            sw.write("Segment,Property Count,Avg Price,Avg Size (sq ft),Avg School Rating\n");
            for (var s : insights.byBedrooms()) {
                sw.write(String.format("%s,%d,%.0f,%.0f,%.1f\n",
                        s.label(), s.count(), s.averagePrice(), s.avgSqFt(), s.avgSchoolRating()));
            }
            sw.write("\n");

            sw.write("Average Price by School Zone\n");
            sw.write("Segment,Property Count,Avg Price,Avg Size (sq ft),Avg School Rating\n");
            for (var s : insights.bySchoolTier()) {
                sw.write(String.format("%s,%d,%.0f,%.0f,%.1f\n",
                        s.label(), s.count(), s.averagePrice(), s.avgSqFt(), s.avgSchoolRating()));
            }
            sw.write("\n");

            sw.write("Average Price by Location Zone\n");
            sw.write("Segment,Property Count,Avg Price,Avg Size (sq ft),Avg School Rating\n");
            for (var s : insights.byLocationZone()) {
                sw.write(String.format("%s,%d,%.0f,%.0f,%.1f\n",
                        s.label(), s.count(), s.averagePrice(), s.avgSqFt(), s.avgSchoolRating()));
            }
            sw.write("\n");
        }

        // ── 3. Price drivers ──────────────────────────────────────────────────
        if (opts.includeDrivers() && insights != null) {
            sw.write("Price Correlation by Feature\n");
            sw.write("Feature,Price Change per Unit,Unit\n");
            for (PriceDriver d : insights.priceDrivers()) {
                sw.write(String.format("%s,%.2f,%s\n", d.label(), d.priceChangePerUnit(), d.unit()));
            }
            sw.write("\n");
        }

        // ── 4 & 5. Top picks ──────────────────────────────────────────────────
        if (opts.includeTopPicks() && insights != null) {
            sw.write("Best Space for Your Money (lowest price per sq ft)\n");
            sw.write("Size (sq ft),Bedrooms,Bathrooms,Year Built,School Rating,City Distance (mi),Price,Price per Sq Ft\n");
            for (ValueSpot v : insights.bestByPrice()) {
                sw.write(String.format("%d,%d,%.1f,%d,%.1f,%.1f,%.0f,%.2f\n",
                        v.squareFootage(), v.bedrooms(), v.bathrooms(), v.yearBuilt(),
                        v.schoolRating(), v.distanceToCityCenter(), v.price(), v.pricePerSqFt()));
            }
            sw.write("\n");

            sw.write("Best School Zone Value (highest school rating per $100k)\n");
            sw.write("Size (sq ft),Bedrooms,Bathrooms,Year Built,School Rating,City Distance (mi),Price,School Rating per $100k\n");
            for (ValueSpot v : insights.bestBySchool()) {
                sw.write(String.format("%d,%d,%.1f,%d,%.1f,%.1f,%.0f,%.2f\n",
                        v.squareFootage(), v.bedrooms(), v.bathrooms(), v.yearBuilt(),
                        v.schoolRating(), v.distanceToCityCenter(), v.price(), v.schoolPer100k()));
            }
            sw.write("\n");
        }

        // ── 6. Full property listing ──────────────────────────────────────────
        if (opts.includeListing()) {
            sw.write("Full Property Listing\n");
            sw.write("Size (sq ft),Bedrooms,Bathrooms,Year Built,Lot Size (sq ft),City Distance (mi),School Rating,Price\n");
            for (HouseRecord r : csvDataService.all()) {
                sw.write(String.format("%d,%d,%.1f,%d,%.0f,%.1f,%.1f,%.0f\n",
                        (int) r.squareFootage(), r.bedrooms(), r.bathrooms(),
                        r.yearBuilt(), r.lotSize(), r.distanceToCityCenter(),
                        r.schoolRating(), r.price()));
            }
        }

        return sw.toString();
    }

    // ── PDF ──────────────────────────────────────────────────────────────────

    /**
     * Generates a PDF report containing only the sections requested in {@link ExportOptions}.
     */
    public byte[] generatePdf(ExportOptions opts) throws IOException {
        var baos = new ByteArrayOutputStream();
        try (var doc = new Document(new PdfDocument(new PdfWriter(baos)))) {
            MarketStatistics stats    = marketService.getStatistics();
            InsightsResponse insights = (opts.includeSegments() || opts.includeDrivers() || opts.includeTopPicks())
                    ? marketService.getInsights() : null;

            // ── Title ──────────────────────────────────────────────────────
            doc.add(new Paragraph("Property Market Report")
                    .setFontSize(20).setBold());
            doc.add(new Paragraph("Generated: " + LocalDate.now())
                    .setFontSize(10).setMarginBottom(4));
            doc.add(new Paragraph(stats.totalProperties() + " properties analysed from Housing Price Dataset")
                    .setFontSize(9).setItalic().setMarginBottom(20));

            // ── 1. Market KPIs ─────────────────────────────────────────────
            if (opts.includeOverview()) {
                doc.add(new Paragraph("Market Overview").setFontSize(14).setBold().setMarginBottom(8));
                Table kpiTable = new Table(UnitValue.createPercentArray(new float[]{55, 45}))
                        .setWidth(UnitValue.createPercentValue(100));
                addRow(kpiTable, "Average Price",         String.format("$%.0f", stats.priceStats().average()));
                addRow(kpiTable, "Median Price",          String.format("$%.0f", stats.priceStats().median()));
                addRow(kpiTable, "Price Range",           String.format("$%.0f – $%.0f", stats.priceStats().min(), stats.priceStats().max()));
                addRow(kpiTable, "Average Size",          String.format("%.0f sq ft", stats.squareFootageStats().average()));
                addRow(kpiTable, "Average Year Built",    String.format("%.0f", stats.yearBuiltStats().average()));
                addRow(kpiTable, "Average School Rating", String.format("%.1f / 10", stats.schoolRatingStats().average()));
                doc.add(kpiTable);
                doc.add(new Paragraph("\n"));
            }

            // ── 2. Segment pricing ─────────────────────────────────────────
            if (opts.includeSegments() && insights != null) {
                doc.add(new Paragraph("Market Segments").setFontSize(14).setBold().setMarginBottom(6));

                doc.add(new Paragraph("By Bedroom Count").setFontSize(11).setBold().setMarginBottom(4));
                doc.add(segmentTable(insights.byBedrooms()));
                doc.add(new Paragraph("\n"));

                doc.add(new Paragraph("By School Zone").setFontSize(11).setBold().setMarginBottom(4));
                doc.add(segmentTable(insights.bySchoolTier()));
                doc.add(new Paragraph("\n"));

                doc.add(new Paragraph("By Location Zone").setFontSize(11).setBold().setMarginBottom(4));
                doc.add(segmentTable(insights.byLocationZone()));
                doc.add(new Paragraph("\n"));
            }

            // ── 3. Price drivers ───────────────────────────────────────────
            if (opts.includeDrivers() && insights != null) {
                doc.add(new Paragraph("Price Correlation by Feature").setFontSize(14).setBold().setMarginBottom(6));
                doc.add(new Paragraph("Estimated price change per one-unit increase in each feature.")
                        .setFontSize(9).setItalic().setMarginBottom(6));
                Table driversTable = new Table(UnitValue.createPercentArray(new float[]{40, 35, 25}))
                        .setWidth(UnitValue.createPercentValue(100));
                driversTable.addHeaderCell(new Cell().add(new Paragraph("Feature").setBold().setFontSize(9)));
                driversTable.addHeaderCell(new Cell().add(new Paragraph("Price Change").setBold().setFontSize(9)));
                driversTable.addHeaderCell(new Cell().add(new Paragraph("Per").setBold().setFontSize(9)));
                for (PriceDriver d : insights.priceDrivers()) {
                    driversTable.addCell(new Cell().add(new Paragraph(d.label()).setFontSize(9)));
                    driversTable.addCell(new Cell().add(new Paragraph(
                            (d.priceChangePerUnit() >= 0 ? "+" : "") + String.format("$%.0f", d.priceChangePerUnit()))
                            .setFontSize(9)));
                    driversTable.addCell(new Cell().add(new Paragraph(d.unit()).setFontSize(9)));
                }
                doc.add(driversTable);
                doc.add(new Paragraph("\n"));
            }

            // ── 4 & 5. Top picks ───────────────────────────────────────────
            if (opts.includeTopPicks() && insights != null) {
                doc.add(new Paragraph("Top Picks by Buyer Priority").setFontSize(14).setBold().setMarginBottom(6));

                doc.add(new Paragraph("Best Space for Your Money (lowest price per sq ft)")
                        .setFontSize(11).setBold().setMarginBottom(4));
                doc.add(valueTable(insights.bestByPrice(), false));
                doc.add(new Paragraph("\n"));

                doc.add(new Paragraph("Best School Zone Value (highest school rating per $100k)")
                        .setFontSize(11).setBold().setMarginBottom(4));
                doc.add(valueTable(insights.bestBySchool(), true));
                doc.add(new Paragraph("\n"));
            }

            // ── 6. Full property listing ───────────────────────────────────
            if (opts.includeListing()) {
                doc.add(new Paragraph("Full Property Listing").setFontSize(14).setBold().setMarginBottom(6));
                doc.add(new Paragraph("All " + stats.totalProperties() + " properties from the dataset.")
                        .setFontSize(9).setItalic().setMarginBottom(6));
                Table listingTable = new Table(
                        UnitValue.createPercentArray(new float[]{12, 8, 8, 8, 12, 11, 11, 14}))
                        .setWidth(UnitValue.createPercentValue(100)).setFontSize(8);
                for (String h : new String[]{"Size (sq ft)", "Beds", "Baths", "Year", "Lot (sq ft)", "City Dist.", "School", "Price"})
                    listingTable.addHeaderCell(new Cell().add(new Paragraph(h).setBold()));
                for (HouseRecord r : csvDataService.all()) {
                    listingTable.addCell(String.valueOf((int) r.squareFootage()));
                    listingTable.addCell(String.valueOf(r.bedrooms()));
                    listingTable.addCell(String.format("%.1f", r.bathrooms()));
                    listingTable.addCell(String.valueOf(r.yearBuilt()));
                    listingTable.addCell(String.format("%.0f", r.lotSize()));
                    listingTable.addCell(String.format("%.1f mi", r.distanceToCityCenter()));
                    listingTable.addCell(String.format("%.1f", r.schoolRating()));
                    listingTable.addCell(String.format("$%.0f", r.price()));
                }
                doc.add(listingTable);
            }
        }
        return baos.toByteArray();
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private Table valueTable(List<ValueSpot> spots, boolean schoolMode) {
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

    private Table segmentTable(List<SegmentInsight> segments) {
        Table t = new Table(UnitValue.createPercentArray(new float[]{35, 13, 22, 18, 12}))
                .setWidth(UnitValue.createPercentValue(100)).setFontSize(9);
        for (String h : new String[]{"Segment", "Count", "Avg Price", "Avg Size (sq ft)", "Avg School"})
            t.addHeaderCell(new Cell().add(new Paragraph(h).setBold().setFontSize(9)));
        for (var s : segments) {
            t.addCell(new Cell().add(new Paragraph(s.label()).setFontSize(9)));
            t.addCell(new Cell().add(new Paragraph(String.valueOf(s.count())).setFontSize(9)));
            t.addCell(new Cell().add(new Paragraph(String.format("$%.0f", s.averagePrice())).setFontSize(9)));
            t.addCell(new Cell().add(new Paragraph(String.format("%.0f sq ft", s.avgSqFt())).setFontSize(9)));
            t.addCell(new Cell().add(new Paragraph(String.format("%.1f", s.avgSchoolRating())).setFontSize(9)));
        }
        return t;
    }

    private void addRow(Table table, String label, String value) {
        table.addCell(new Cell().add(new Paragraph(label).setBold()));
        table.addCell(new Cell().add(new Paragraph(value)));
    }
}
