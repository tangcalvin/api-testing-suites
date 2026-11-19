package com.philomath.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "One shipment call fault. type is E for error, W for warning, I for information.")
public record ShipmentFault(
        @Schema(allowableValues = {"E", "W", "I"}, example = "E")
        String type,
        @Schema(example = "ERR001")
        String code,
        @Schema(example = "Missing field: reference")
        String message
) {
}
