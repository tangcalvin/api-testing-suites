package com.philomath.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Stored customer")
public record Customer(
        @Schema(example = "1")
        Long id,
        String customerCode,
        String name,
        String email,
        CustomerStatus status,
        CustomerProfile profile
) {
}
