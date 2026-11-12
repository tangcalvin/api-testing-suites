package com.philomath.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

@Schema(description = "One page of orders")
public record OrderPage(
        List<Order> content,
        @Schema(description = "Zero-based page index", example = "0")
        int page,
        @Schema(description = "Page size", example = "20")
        int size,
        @Schema(description = "Orders matching the filters", example = "42")
        long totalElements,
        @Schema(description = "Pages available at this size", example = "3")
        int totalPages
) {
}
