package com.philomath.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@Schema(description = "Fields accepted when creating or replacing a product")
public record ProductRequest(
        @Schema(example = "PRD-1001")
        @NotBlank
        @Size(max = 20)
        String sku,

        @Schema(example = "Harbour mug")
        @NotBlank
        @Size(max = 80)
        String name,

        @Schema(example = "48.0")
        @NotNull
        @DecimalMin("0.0")
        @DecimalMax("1000000.0")
        Double unitPrice,

        @NotNull
        CurrencyCode currency,

        @NotNull
        ProductStatus status,

        @Schema(example = "12")
        @NotNull
        @Min(0)
        @Max(100000)
        Integer stock
) {
}
