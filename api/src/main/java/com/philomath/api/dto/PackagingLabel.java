package com.philomath.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@Schema(description = "Carrier label printed on the packaging")
public record PackagingLabel(
        @Schema(example = "LBL-1001")
        @NotBlank
        @Size(max = 40)
        String code,

        @Schema(example = "DHL")
        @NotBlank
        @Size(max = 40)
        String carrier
) {
}
