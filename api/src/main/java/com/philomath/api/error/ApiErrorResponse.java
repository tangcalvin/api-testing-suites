package com.philomath.api.error;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

@Schema(description = "Standard error body. exceptions contains every field failure.")
public record ApiErrorResponse(
        @Schema(example = "400")
        int status,
        List<FieldException> exceptions
) {
}
