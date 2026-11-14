package com.philomath.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.LocalDate;
import java.time.OffsetDateTime;

@Schema(description = "Stored order")
public record Order(
        @Schema(example = "1")
        Long id,
        String orderNumber,
        OrderStatus status,
        Priority priority,
        String customerName,
        String customerEmail,
        Integer quantity,
        Double unitPrice,
        Double taxRate,
        CurrencyCode currency,
        Double discountAmount,
        String countryCode,
        OffsetDateTime orderedAt,
        LocalDate requestedDeliveryDate,
        String notes,
        Boolean giftWrap,
        String warehouseCode,
        String couponCode,
        String promotionCode,
        DeliveryAddress deliveryAddress
) {
}
