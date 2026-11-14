package com.philomath.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@Schema(description = "Profile nested on a customer")
public record CustomerProfile(
        @Schema(example = "Ada")
        @NotBlank
        @Size(max = 80)
        String displayName,

        @Schema(example = "en-HK")
        @NotBlank
        @Size(max = 10)
        String locale,

        @NotNull
        @Valid
        CustomerCompany company
) {
}
