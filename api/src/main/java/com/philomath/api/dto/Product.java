package com.philomath.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;

@Schema(description = "Stored product")
public record Product(
        @Schema(example = "1")
        Long id,
        String sku,
        String name,
        Double unitPrice,
        CurrencyCode currency,
        ProductStatus status,
        Integer stock
) {
}
