package com.philomath.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.OffsetDateTime;
import java.util.Map;

@Schema(description = "Stored shipment")
public record Shipment(
        @Schema(example = "1")
        Long id,
        String reference,
        String recipient,
        String destination,
        Double weightKg,
        Priority priority,
        ShipmentStatus status,
        Boolean insured,
        @Schema(format = "date")
        LocalDate readyDate,
        @Schema(type = "string", format = "time")
        LocalTime cutoffTime,
        @Schema(format = "date-time")
        OffsetDateTime bookedAt,
        @Schema(description = "Empty object when packaging was sent.", additionalProperties = Schema.AdditionalPropertiesValue.FALSE)
        Map<String, Object> packaging
) {
}
