package com.philomath.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

@Schema(description = "Identifies one shipment. The id is sent in the payload.")
public record ShipmentId(
        @Schema(example = "1")
        @NotNull
        @Positive
        Long id
) {
}
