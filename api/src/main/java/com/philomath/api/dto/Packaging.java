package com.philomath.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@Schema(description = "Optional packaging details. When sent, type, dimensions, and label are all required.")
public record Packaging(
        @Schema(example = "BOX", allowableValues = {"BOX", "ENVELOPE", "PALLET"})
        @NotBlank
        @Size(max = 20)
        String type,

        @NotNull
        @Valid
        PackagingDimensions dimensions,

        @NotNull
        @Valid
        PackagingLabel label
) {
}
