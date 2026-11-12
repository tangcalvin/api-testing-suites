package com.philomath.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@Schema(description = "Street address where the order is delivered")
public record DeliveryAddress(
        @Schema(example = "1 Harbour Road")
        @NotBlank
        @Size(max = 120)
        String line1,

        @Schema(example = "Hong Kong")
        @NotBlank
        @Size(max = 80)
        String city,

        @Schema(example = "999077")
        @NotBlank
        @Size(max = 12)
        String postalCode
) {
}
