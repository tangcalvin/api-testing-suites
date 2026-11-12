package com.philomath.api.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.time.OffsetDateTime;

@Schema(description = "Fields accepted when creating or replacing an order")
public record OrderRequest(
        @Schema(example = "ORD-1001")
        @NotBlank
        @Size(max = 40)
        String orderNumber,

        @NotNull
        OrderStatus status,

        @NotNull
        Priority priority,

        @Schema(example = "Ada Lovelace")
        @NotBlank
        @Size(max = 80)
        String customerName,

        @Schema(example = "ada@example.com")
        @NotBlank
        @Email
        @Size(max = 120)
        String customerEmail,

        @Schema(minimum = "1", maximum = "10000")
        @NotNull
        @Positive
        @Max(10000)
        Integer quantity,

        @Schema(example = "19.5", minimum = "0", maximum = "1000000")
        @NotNull
        @PositiveOrZero
        @DecimalMax("1000000.0")
        Double unitPrice,

        @Schema(example = "0.08", description = "Tax rate from 0 to 1", minimum = "0", maximum = "1")
        @NotNull
        @DecimalMin("0.0")
        @DecimalMax("1.0")
        Double taxRate,

        @NotNull
        CurrencyCode currency,

        @Schema(minimum = "0", maximum = "1000000")
        @NotNull
        @PositiveOrZero
        @DecimalMax("1000000.0")
        Double discountAmount,

        @Schema(example = "HK", pattern = "[A-Z]{2}", maxLength = 2)
        @NotBlank
        @Size(max = 2)
        @Pattern(regexp = "[A-Z]{2}", message = "countryCode must be two uppercase letters")
        String countryCode,

        @NotNull
        @PastOrPresent
        OffsetDateTime orderedAt,

        @NotNull
        @Future
        LocalDate requestedDeliveryDate,

        @Size(max = 500)
        String notes,

        @NotNull
        Boolean giftWrap,

        @Schema(example = "HK-01")
        @NotBlank
        @Size(max = 20)
        String warehouseCode,

        @NotNull
        @Valid
        DeliveryAddress deliveryAddress
) {
}
