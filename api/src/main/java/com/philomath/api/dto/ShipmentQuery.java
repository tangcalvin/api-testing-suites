package com.philomath.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

@Schema(description = "Page of shipments. nextCursor and size travel in the payload. Send nextCursor 0 for the first page.")
public record ShipmentQuery(
        @Schema(description = "Hashed cursor of the first key of this page. Send 0 for the first page. Use the nextCursor from the previous response for the next page.", example = "0", defaultValue = "0")
        String nextCursor,

        @Schema(description = "Page size from 1 to 100. Defaults to 20.", example = "20", minimum = "1", maximum = "100")
        @Min(1)
        @Max(100)
        Integer size,

        @Schema(description = "Optional reference filter. Matches when the stored reference contains this text.", example = "SHP")
        @Size(max = 40)
        String reference
) {
}
