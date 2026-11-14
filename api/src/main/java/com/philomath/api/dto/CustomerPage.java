package com.philomath.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.util.List;

@Schema(description = "One page of customers")
public record CustomerPage(
        List<Customer> content,
        @Schema(description = "Zero-based page index", example = "0")
        int page,
        @Schema(description = "Page size", example = "20")
        int size,
        @Schema(description = "Customers on file", example = "4")
        long totalElements,
        @Schema(description = "Pages available at this size", example = "1")
        int totalPages
) {
}
