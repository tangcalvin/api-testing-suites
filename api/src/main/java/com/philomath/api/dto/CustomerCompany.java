package com.philomath.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@Schema(description = "Company recorded on a customer profile")
public record CustomerCompany(
        @Schema(example = "Harbour Trading Ltd")
        @NotBlank
        @Size(max = 120)
        String name,

        @Schema(example = "12345678")
        @NotBlank
        @Size(max = 40)
        String registrationNo
) {
}
