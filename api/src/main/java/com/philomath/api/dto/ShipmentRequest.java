package com.philomath.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

@Schema(description = "Fields accepted when creating a shipment")
public record ShipmentRequest(
        @Schema(example = "SHP-1001")
        @NotBlank
        @Size(max = 40)
        String reference,

        @Schema(example = "Ada Lovelace")
        @NotBlank
        @Size(max = 80)
        String recipient,

        @Schema(example = "HK")
        @NotBlank
        @Size(max = 2)
        @Pattern(regexp = "[A-Z]{2}")
        String destination,

        @Schema(example = "1.25")
        @NotNull
        @DecimalMin("0.01")
        @DecimalMax("10000.0")
        Double weightKg,

        @NotNull
        Priority priority,

        @NotNull
        ShipmentStatus status,

        @NotNull
        Boolean insured
) {
}
