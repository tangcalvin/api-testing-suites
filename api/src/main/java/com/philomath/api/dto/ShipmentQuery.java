package com.philomath.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

@Schema(description = "Page of shipments. page and size travel in the payload.")
public record ShipmentQuery(
        @Schema(description = "Zero-based page index. Defaults to 0.", example = "0", minimum = "0")
        @Min(0)
        Integer page,

        @Schema(description = "Page size from 1 to 100. Defaults to 20.", example = "20", minimum = "1", maximum = "100")
        @Min(1)
        @Max(100)
        Integer size,

        @Schema(description = "Optional reference filter. Matches when the stored reference contains this text.", example = "SHP")
        @Size(max = 40)
        String reference
) {
}
