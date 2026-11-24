package com.philomath.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

@Schema(description = "Outer dimensions of the packaging, in centimetres")
public record PackagingDimensions(
        @Schema(example = "30")
        @NotNull
        @DecimalMin("0.1")
        @DecimalMax("300.0")
        Double lengthCm,

        @Schema(example = "20")
        @NotNull
        @DecimalMin("0.1")
        @DecimalMax("300.0")
        Double widthCm,

        @Schema(example = "15")
        @NotNull
        @DecimalMin("0.1")
        @DecimalMax("300.0")
        Double heightCm
) {
}
