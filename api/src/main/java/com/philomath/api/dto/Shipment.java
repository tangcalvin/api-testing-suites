package com.philomath.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;

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
        Boolean insured
) {
}
