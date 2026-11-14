package com.philomath.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@Schema(description = "Region inside a delivery address")
public record Region(
        @Schema(example = "HK-IS")
        @NotBlank
        @Size(max = 12)
        String code,

        @Schema(example = "Hong Kong Island")
        @NotBlank
        @Size(max = 80)
        String name
) {
}
