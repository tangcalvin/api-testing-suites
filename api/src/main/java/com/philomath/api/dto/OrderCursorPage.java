package com.philomath.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

@Schema(description = "Orders following a cursor")
public record OrderCursorPage(
        List<Order> items,
        @Schema(description = "Pass this value as nextCursor to read the following page. Null on the last page.", example = "20", nullable = true)
        String nextCursor
) {
}
