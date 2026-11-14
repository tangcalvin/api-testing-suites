package com.philomath.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@Schema(description = "Fields accepted when creating or replacing a customer")
public record CustomerRequest(
        @Schema(example = "CUS-1001")
        @NotBlank
        @Size(max = 20)
        String customerCode,

        @Schema(example = "Ada Lovelace")
        @NotBlank
        @Size(max = 80)
        String name,

        @Schema(example = "ada@example.com")
        @NotBlank
        @Email
        @Size(max = 120)
        String email,

        @NotNull
        CustomerStatus status,

        @NotNull
        @Valid
        CustomerProfile profile
) {
}
