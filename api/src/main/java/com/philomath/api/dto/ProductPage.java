package com.philomath.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

@Schema(description = "Products after a cursor. Pass nextCursor back with the same size to read the following page.")
public record ProductPage(
        List<Product> content,
        @Schema(description = "Page size that was applied", example = "20")
        int size,
        @Schema(description = "Products on file", example = "4")
        long totalSize,
        @Schema(description = "Pass this value as nextCursor to read the following page. Null on the last page.", example = "20", nullable = true)
        String nextCursor
) {
}
