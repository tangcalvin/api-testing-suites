package com.philomath.api.error;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "One field validation failure")
public record FieldException(
        @Schema(example = "quantity")
        String field,
        @Schema(example = "Positive", description = "Constraint or error code")
        String code,
        @Schema(example = "must be greater than 0")
        String message
) {
}
